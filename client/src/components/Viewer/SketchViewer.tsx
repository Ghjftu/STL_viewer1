import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// ========== Типы ==========
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

interface TextNote {
  id: number;
  text: string;
}

interface SketchItem {
  id: string | number;
  folderNumber: number;
  createdAt: string;
  is_read?: boolean;
  cameraState?: {
    position?: Vector3Tuple;
    rotation?: Vector3Tuple;
    zoom?: number;
    viewportWidth?: number;
    viewportHeight?: number;
  };
  modelsState?: SceneStateItem[];
  textNotes?: TextNote[];
}

// ========== Константы и утилиты ==========
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

const parseSceneState = (value: unknown): SceneStateItem[] => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeModelsWithState = (models: Partial<STLModel>[], sceneState: unknown) => {
  const safeState = parseSceneState(sceneState);
  return models.map((model) => {
    const defaults = buildDefaultModel(model);
    const saved = safeState.find((item) => String(item.id) === String(defaults.id));
    if (!saved) return defaults;
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

// ========== 3D Компоненты ==========
const STLMesh: React.FC<{
  model: STLModel;
  index: number;
  transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
}> = ({ model, index, transparentGroupRefs }) => {
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
              <meshStandardMaterial
                color={model.color}
                transparent
                opacity={model.opacity}
                side={THREE.BackSide}
                depthWrite
                depthTest
              />
            </mesh>
            <mesh geometry={geom} renderOrder={2}>
              <meshStandardMaterial
                color={model.color}
                transparent
                opacity={model.opacity}
                side={THREE.FrontSide}
                depthWrite={false}
                depthTest
              />
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

// ========== Компонент для синхронизации SVG с камерой ==========
interface SVGSyncProps {
  svgContainerRef: React.RefObject<HTMLDivElement | null>; // исправлен тип
  initialCameraState: SketchItem['cameraState'];
}

const SVGSync: React.FC<SVGSyncProps> = ({ svgContainerRef, initialCameraState }) => {
  const { camera } = useThree();
  const initialPos = useRef<THREE.Vector3 | null>(null);
  const initialZoom = useRef<number | null>(null);

  // Сохраняем начальное состояние камеры при монтировании или изменении initialCameraState
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera && initialCameraState) {
      initialPos.current = camera.position.clone();
      initialZoom.current = camera.zoom;
    }
  }, [camera, initialCameraState]);

  useFrame(() => {
    if (!svgContainerRef.current || !(camera instanceof THREE.OrthographicCamera) || !initialPos.current || initialZoom.current === null) return;

    // Вычисляем смещение относительно начальной позиции
    const deltaX = camera.position.x - initialPos.current.x;
    const deltaY = camera.position.y - initialPos.current.y;
    const zoomRatio = camera.zoom / initialZoom.current;

    // Масштабируем смещение в соответствии с текущим зумом (пиксели = мировые * zoom)
    const translateX = -deltaX * camera.zoom;  // знак минус, чтобы SVG двигался в ту же сторону, что и модель
    const translateY = deltaY * camera.zoom;

    // Применяем transform
    svgContainerRef.current.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomRatio})`;
  });

  return null;
};

// ========== Основной компонент ==========
export const SketchViewer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [project, setProject] = useState<any>(null);
  const [projectModels, setProjectModels] = useState<Partial<STLModel>[]>([]);
  const [projectSceneState, setProjectSceneState] = useState<SceneStateItem[]>([]);
  const [sketches, setSketches] = useState<SketchItem[]>([]);
  const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const cameraControlsRef = useRef<any>(null);

  // --- Функция отправки статуса "прочитано" на сервер ---
  const markAsRead = async (sketchId: string | number) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/projects/sketches/${sketchId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
    } catch (err) {
      console.error('Не удалось отметить как прочитанное', err);
    }
  };

  // Загрузка данных
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

        const sketchesArray = (Array.isArray(sketchesData) ? sketchesData : []).map((s: any) => ({
          ...s,
          is_read: s.is_read || false,
        }));
        setSketches(sketchesArray);
        if (sketchesArray.length > 0) {
          loadSketchSvg(sketchesArray[0].folderNumber);
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

  const handleSketchSelect = (sketch: SketchItem) => {
    const index = sketches.findIndex((s) => s.id === sketch.id);
    if (index !== -1) {
      setCurrentSketchIndex(index);
    }
    loadSketchSvg(sketch.folderNumber);

    if (!sketch.is_read) {
      markAsRead(sketch.id);
      setSketches((prev) => prev.map((s) => (s.id === sketch.id ? { ...s, is_read: true } : s)));
    }
  };

  const currentSketch = sketches[currentSketchIndex];

  // Модели для 3D
  const stlModels = useMemo(() => {
    const rawSketchState = currentSketch?.modelsState || (currentSketch as any)?.models_state;
    const sketchSceneState = parseSceneState(rawSketchState);
    const fallbackProjectState = parseSceneState(projectSceneState);
    const localStateRaw = localStorage.getItem(`viewer3d:scene:${projectId}`);
    const localSceneState = parseSceneState(localStateRaw);

    const stateToUse =
      sketchSceneState.length > 0
        ? sketchSceneState
        : fallbackProjectState.length > 0
        ? fallbackProjectState
        : localSceneState;

    return mergeModelsWithState(projectModels, stateToUse);
  }, [projectModels, currentSketch, projectSceneState, projectId]);

  useEffect(() => {
    transparentGroupRefs.current = new Array(stlModels.length).fill(null);
  }, [stlModels]);

  
  // Скачивание
  const downloadSvg = async (folderNumber: number) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches/${folderNumber}/svg`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        Загрузка эскизов...
      </div>
    );
  }

  if (!project || sketches.length === 0 || !currentSketch) {
    return (
      <div className="h-screen bg-gray-900 text-red-500 flex items-center justify-center">
        Нет сохранённых эскизов
      </div>
    );
  }

  const anchorWidth =
    currentSketch.cameraState?.viewportWidth || canvasContainerRef.current?.clientWidth || 800;
  const anchorHeight =
    currentSketch.cameraState?.viewportHeight || canvasContainerRef.current?.clientHeight || 600;

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Левая панель: список эскизов с бейджами NEW */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto flex flex-col shrink-0">
        <h2 className="text-xl font-bold mb-4">Эскизы проекта</h2>
        <div className="space-y-2">
          {sketches.map((sketch) => (
            <div key={sketch.id} className="flex items-center">
              <button
                onClick={() => handleSketchSelect(sketch)}
                className={`flex-1 text-left p-3 rounded-lg transition relative ${
                  sketch.id === currentSketch?.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="font-bold">Эскиз #{sketch.folderNumber}</div>
                <div className="text-xs opacity-75">
                  {new Date(sketch.createdAt).toLocaleString()}
                </div>
                {!sketch.is_read && (
                  <div className="absolute -top-1 -right-1 z-20">
                    <span className="flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                  </div>
                )}
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

      {/* Центральная область: 3D + SVG */}
      <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden bg-black">
        <Canvas
          className="absolute inset-0 w-full h-full"
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => gl.setClearColor('#000000')}
        >
          <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
          {/* Контроллер камеры */}
          <OrbitControls
            ref={cameraControlsRef}
            enableRotate={false}
            enablePan={true}
            enableZoom={true}
            zoomSpeed={1.2}
            panSpeed={0.8}
            mouseButtons={{
              LEFT: THREE.MOUSE.PAN,
              MIDDLE: THREE.MOUSE.DOLLY,
              RIGHT: THREE.MOUSE.ROTATE,
            }}
          />
          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 50, 50]} intensity={1.5} />
          <directionalLight position={[-50, -50, -50]} intensity={0.5} />
          {stlModels.map((model, index) => (
            <STLMesh
              key={model.id}
              model={model}
              index={index}
              transparentGroupRefs={transparentGroupRefs}
            />
          ))}
          <TransparencySorter transparentGroupRefs={transparentGroupRefs} />

          {/* Синхронизация SVG с камерой */}
          {svgContent && (
            <SVGSync
              svgContainerRef={svgContainerRef}
              initialCameraState={currentSketch.cameraState}
            />
          )}
        </Canvas>

        {/* SVG оверлей (позиционируется абсолютно, трансформируется через SVGSync) */}
        {svgContent && (
          <div
            ref={svgContainerRef}
            className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-visible"
            style={{
              transformOrigin: 'center center',
              willChange: 'transform',
            }}
          >
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

      {/* Правая панель: комментарии врача */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto shrink-0">
        <h3 className="text-lg font-semibold mb-4 flex items-center text-blue-400">
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
          Комментарии врача
        </h3>

        <div className="space-y-4">
          {currentSketch.textNotes && currentSketch.textNotes.length > 0 ? (
            currentSketch.textNotes.map((note) => (
              <div
                key={note.id}
                className="flex items-start space-x-3 p-3 bg-gray-750 rounded-xl shadow-md border border-gray-700 hover:border-blue-500/50 transition-colors"
              >
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {note.id}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">
                    {note.text}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <svg
                className="w-12 h-12 mb-2 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-sm italic">Комментариев пока нет</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};