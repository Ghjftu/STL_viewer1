import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

type Vector3Tuple = [number, number, number];
type ModelId = string | number;

interface SceneStateItem {
 id: ModelId;
 visible: boolean;
 color: string;
 opacity: number;
 position: Vector3Tuple;
 rotation: Vector3Tuple;
}

interface STLModel extends SceneStateItem {
 name?: string;
 url: string;
}

interface SketchItem {
 id: string | number;
 folderNumber: number;
 createdAt: string;
 cameraState?: {
 position?: Vector3Tuple;
 rotation?: Vector3Tuple;
 zoom?: number;
 viewportWidth?: number;
 viewportHeight?: number;
 };
 modelsState?: SceneStateItem[];
 textNotes?: { id: number; text: string }[];
}

const DEFAULT_MODEL_COLOR = '#cccccc';
const DEFAULT_POSITION: Vector3Tuple = [0, 0, 0];
const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];

const clampOpacity = (value: number) => Math.min(1, Math.max(0, value));

const buildDefaultModel = (model: Partial<STLModel>): STLModel => ({
  id: model.id ?? '',
  name: model.name,
  url: model.url ?? '',
  visible: model.visible ?? true,
  color: typeof model.color === 'string' ? model.color : DEFAULT_MODEL_COLOR,
  opacity: clampOpacity(Number(model.opacity ?? 1)),
  position: Array.isArray(model.position) ? (model.position as Vector3Tuple) : DEFAULT_POSITION,
  rotation: Array.isArray(model.rotation) ? (model.rotation as Vector3Tuple) : DEFAULT_ROTATION,
});

// Универсальная функция для безопасного парсинга (как в Viewer3D)
const parseSceneState = (value: unknown): SceneStateItem[] => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Надежное слияние данных с приведением типов ID
const mergeModelsWithState = (models: Partial<STLModel>[], sceneState: unknown) => {
  const safeState = parseSceneState(sceneState);

  return models.map((model) => {
    const defaults = buildDefaultModel(model);
    // Важно: сравниваем через String(), чтобы избежать ошибки 1 !== "1"
    const saved = safeState.find((item) => String(item.id) === String(defaults.id));

    if (!saved) {
      return defaults;
    }

    return {
      ...defaults,
      ...saved,
      color: saved.color || defaults.color,
      opacity: saved.opacity !== undefined ? clampOpacity(Number(saved.opacity)) : defaults.opacity,
      position: Array.isArray(saved.position) ? (saved.position as Vector3Tuple) : defaults.position,
      rotation: Array.isArray(saved.rotation) ? (saved.rotation as Vector3Tuple) : defaults.rotation,
      visible: saved.visible !== undefined ? saved.visible : defaults.visible,
    };
  });
};

const STLMesh: React.FC<{ model: STLModel; index: number; transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]> }> = ({
 model,
 index,
 transparentGroupRefs,
}) => {
 const geometry = useLoader(STLLoader, model.url);
 const geometries = Array.isArray(geometry) ? geometry : [geometry];
 const rotationInRadians: Vector3Tuple = [
 THREE.MathUtils.degToRad(model.rotation[0]),
 THREE.MathUtils.degToRad(model.rotation[1]),
 THREE.MathUtils.degToRad(model.rotation[2]),
 ];
 const isTransparent = model.opacity < 0.99;

 return (
 <group
 position={model.position}
 rotation={rotationInRadians}
 visible={model.visible}
 ref={(element) => {
 transparentGroupRefs.current[index] = isTransparent ? element : null;
 }}
 >
 {geometries.map((geom, idx) =>
 isTransparent ? (
 <React.Fragment key={idx}>
 <mesh geometry={geom} renderOrder={1}>
 <meshStandardMaterial color={model.color} transparent opacity={model.opacity} side={THREE.BackSide} depthWrite depthTest />
 </mesh>
 <mesh geometry={geom} renderOrder={2}>
 <meshStandardMaterial color={model.color} transparent opacity={model.opacity} side={THREE.FrontSide} depthWrite={false} depthTest />
 </mesh>
 </React.Fragment>
 ) : (
 <mesh key={idx} geometry={geom}>
 <meshStandardMaterial color={model.color} side={THREE.DoubleSide} />
 </mesh>
 )
 )}
 </group>
 );
};

const TransparencySorter: React.FC<{
 transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
}> = ({ transparentGroupRefs }) => {
 const { camera } = useThree();

 useFrame(() => {
 const groups = transparentGroupRefs.current.filter((group): group is THREE.Group => group !== null);
 if (groups.length === 0) return;

 groups.sort((a, b) => camera.position.distanceTo(b.position) - camera.position.distanceTo(a.position));
 groups.forEach((group, index) => {
 group.renderOrder = 100 + index;
 });
 });

 return null;
};

const FixedCamera: React.FC<{ cameraState?: SketchItem['cameraState'] }> = ({ cameraState }) => {
 const { camera } = useThree();

 useEffect(() => {
 if (!cameraState) return;

 if (camera instanceof THREE.OrthographicCamera) {
 if (Array.isArray(cameraState.position)) {
 camera.position.set(cameraState.position[0], cameraState.position[1], cameraState.position[2]);
 }
 if (Array.isArray(cameraState.rotation)) {
 camera.rotation.set(cameraState.rotation[0], cameraState.rotation[1], cameraState.rotation[2]);
 }
 if (cameraState.zoom) {
 camera.zoom = cameraState.zoom;
 }
 camera.updateProjectionMatrix();
 }
 }, [camera, cameraState]);

 return null;
};

export const SketchViewer: React.FC<{ projectId: string }> = ({ projectId }) => {
 const [project, setProject] = useState<any>(null);
 const [projectModels, setProjectModels] = useState<Partial<STLModel>[]>([]);
 const [projectSceneState, setProjectSceneState] = useState<SceneStateItem[]>([]);
 const [sketches, setSketches] = useState<SketchItem[]>([]);
 const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
 const [svgContent, setSvgContent] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);

 const containerRef = useRef<HTMLDivElement>(null);
 const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);

 useEffect(() => {
 const token = localStorage.getItem('token');
 if (!token) return;

 Promise.all([
 fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
 headers: { Authorization: `Bearer ${token}` },
 }).then((res) => res.json()),
 fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches`, {
 headers: { Authorization: `Bearer ${token}` },
 }).then((res) => res.json()),
 ])
 .then(([projectData, sketchesData]) => {
 setProject(projectData.project);
 setProjectModels(projectData.stlFiles || []);
 setProjectSceneState(parseSceneState(projectData?.project?.scene_state));

setSketches(Array.isArray(sketchesData) ? sketchesData : []);
 setSketches(Array.isArray(sketchesData) ? sketchesData : []);
 if (Array.isArray(sketchesData) && sketchesData.length > 0) {
 loadSketchSvg(sketchesData[0].folderNumber);
 }
 })
 .catch(console.error)
 .finally(() => setLoading(false));
 }, [projectId]);

 const loadSketchSvg = (folderNumber: number) => {
 const token = localStorage.getItem('token');
 fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches/${folderNumber}/svg`, {
 headers: { Authorization: `Bearer ${token}` },
 })
 .then((res) => res.text())
 .then((svg) => {
 try {
 const parser = new DOMParser();
 const doc = parser.parseFromString(svg, 'image/svg+xml');
 const svgElement = doc.documentElement;

 if (svgElement.tagName.toLowerCase() === 'svg') {
 svgElement.removeAttribute('class');
 svgElement.removeAttribute('width');
 svgElement.removeAttribute('height');
 svgElement.setAttribute('style', 'width: 100%; height: 100%; display: block; overflow: visible;');
 setSvgContent(svgElement.outerHTML);
 } else {
 setSvgContent(svg);
 }
 } catch (error) {
 console.error('SVG parse error:', error);
 setSvgContent(svg);
 }
 })
 .catch(console.error);
 };

 const handleSketchChange = (index: number) => {
 setCurrentSketchIndex(index);
 const sketch = sketches[index];
 if (sketch) {
 loadSketchSvg(sketch.folderNumber);
 }
 };

 const currentSketch = sketches[currentSketchIndex];

const stlModels = useMemo(() => {
  // 1. Пытаемся достать стейт из эскиза (учитываем, что бэкенд мог переименовать ключ)
  const rawSketchState = currentSketch?.modelsState || (currentSketch as any)?.models_state;
  const sketchSceneState = parseSceneState(rawSketchState);

  // 2. Если стейта в эскизе нет, фолбэк на стейт всего проекта
  const fallbackProjectState = parseSceneState(projectSceneState);

  // 3. Последний рубеж: читаем LocalStorage (откуда берет цвета сам Viewer3D)
  const localStateRaw = localStorage.getItem(`viewer3d:scene:${projectId}`);
  const localSceneState = parseSceneState(localStateRaw);

  // Выбираем самый актуальный непустой стейт
  const stateToUse = sketchSceneState.length > 0 
    ? sketchSceneState 
    : fallbackProjectState.length > 0 
      ? fallbackProjectState 
      : localSceneState;

  return mergeModelsWithState(projectModels, stateToUse);
}, [projectModels, currentSketch, projectSceneState, projectId]);

 useEffect(() => {
 transparentGroupRefs.current = new Array(stlModels.length).fill(null);
 }, [stlModels]);

 const downloadSvg = async (folderNumber: number) => {
 const token = localStorage.getItem('token');
 try {
 const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches/${folderNumber}/svg`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const svgText = await response.text();
 const blob = new Blob([svgText], { type: 'image/svg+xml' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `sketch-${folderNumber}.svg`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 } catch (error) {
 console.error('Download SVG error:', error);
 }
 };

 const downloadJson = (sketch: SketchItem) => {
 const jsonStr = JSON.stringify(sketch, null, 2);
 const blob = new Blob([jsonStr], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `sketch-${sketch.folderNumber}.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 };

 if (loading) return <div className="h-screen bg-gray-900 text-white flex items-center justify-center">Загрузка эскизов...</div>;
 if (!project || sketches.length === 0 || !currentSketch) return <div className="h-screen bg-gray-900 text-red-500 flex items-center justify-center">Нет сохранённых эскизов</div>;

 const anchorWidth = currentSketch.cameraState?.viewportWidth || containerRef.current?.clientWidth || 800;
 const anchorHeight = currentSketch.cameraState?.viewportHeight || containerRef.current?.clientHeight || 600;

 return (
 <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
 <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto flex flex-col z-20 shrink-0">
 <h2 className="text-xl font-bold mb-4">Эскизы проекта</h2>
 <div className="space-y-2 mb-6">
 {sketches.map((sketch, idx) => (
 <div key={sketch.id} className="flex items-center">
 <button
 onClick={() => handleSketchChange(idx)}
 className={`flex-1 text-left p-3 rounded-lg transition ${idx === currentSketchIndex ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
 >
 <div className="font-bold">Эскиз #{sketch.folderNumber}</div>
 <div className="text-xs opacity-75">{new Date(sketch.createdAt).toLocaleString()}</div>
 </button>
 <div className="flex flex-col ml-2 space-y-1">
 <button
 onClick={(e) => {
 e.stopPropagation();
 downloadSvg(sketch.folderNumber);
 }}
 className="p-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
 title="Скачать SVG"
 >
 SVG
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 downloadJson(sketch);
 }}
 className="p-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
 title="Скачать JSON"
 >
 JSON
 </button>
 </div>
 </div>
 ))}
 </div>
 </div>

 <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white">
 <Canvas className="w-full h-full absolute inset-0" gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor('#ffffff')}>
 <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
 <FixedCamera cameraState={currentSketch.cameraState} />
 <ambientLight intensity={0.6} />
 <directionalLight position={[50, 50, 50]} intensity={1.5} />
 <directionalLight position={[-50, -50, -50]} intensity={0.5} />
 {stlModels.map((model, index) => (
 <STLMesh key={model.id} model={model} index={index} transparentGroupRefs={transparentGroupRefs} />
 ))}
 <TransparencySorter transparentGroupRefs={transparentGroupRefs} />
 </Canvas>

 {svgContent && (
 <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-visible">
 <div
 style={{
 width: anchorWidth,
 height: anchorHeight,
 position: 'relative',
 flexShrink: 0,
 }}
 dangerouslySetInnerHTML={{ __html: svgContent }}
 />
 </div>
 )}
 </div>
 </div>
 );
};
