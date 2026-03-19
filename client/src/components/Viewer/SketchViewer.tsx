import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
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
  is_read?: boolean;                   // <-- добавили поле
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
  visible: true, 
  opacity: 1, 
  color: DEFAULT_MODEL_COLOR, 
  position: [...DEFAULT_POSITION], 
  rotation: [...DEFAULT_ROTATION], 
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

const mergeModelsWithState = (files: Partial<STLModel>[], sceneState: unknown): STLModel[] => {
  const safeState = parseSceneState(sceneState);
  
  return files.map((file) => {
    const defaults = buildDefaultModel(file);
    // Приводим ID к строке для 100% точного совпадения
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

// ========== Основной компонент ==========
export const SketchViewer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [project, setProject] = useState<any>(null);
  const [projectModels, setProjectModels] = useState<Partial<STLModel>[]>([]);
  const [projectSceneState, setProjectSceneState] = useState<SceneStateItem[]>([]);
  const [sketches, setSketches] = useState<SketchItem[]>([]);
  const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Состояние и рефы для панорамирования/масштабирования
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleChange = e.deltaY > 0 ? 0.95 : 1.05;
    setViewState(prev => ({
      ...prev,
      scale: Math.max(0.2, Math.min(prev.scale * scaleChange, 5))
    }));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();  
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragStart.current = { x: e.clientX - viewState.x, y: e.clientY - viewState.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
     e.preventDefault();  
    if (!isDragging.current) return;
    setViewState(prev => ({
      ...prev,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    }));
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);

  // --- Функция отправки статуса "прочитано" на сервер ---
  const markAsRead = async (sketchId: string | number) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/projects/sketches/${sketchId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
    } catch (err) {
      console.error("Не удалось отметить как прочитанное", err);
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

        // Приводим sketches к нужному формату, добавляем is_read (по умолчанию false)
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

  // --- Новый обработчик выбора скетча ---
  const handleSketchSelect = (sketch: SketchItem) => {
    // Находим индекс для установки currentSketchIndex
    const index = sketches.findIndex(s => s.id === sketch.id);
    if (index !== -1) {
      setCurrentSketchIndex(index);
    }
    // Загружаем SVG
    loadSketchSvg(sketch.folderNumber);

    // Если скетч ещё не прочитан, отмечаем на сервере и локально
    if (!sketch.is_read) {
      markAsRead(sketch.id);
      setSketches(prev => prev.map(s =>
        s.id === sketch.id ? { ...s, is_read: true } : s
      ));
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

  const anchorWidth = currentSketch.cameraState?.viewportWidth || canvasContainerRef.current?.clientWidth || 800;
  const anchorHeight = currentSketch.cameraState?.viewportHeight || canvasContainerRef.current?.clientHeight || 600;

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
                {/* Бейдж NEW для непрочитанных */}
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
     <div
  ref={canvasContainerRef}
  className="flex-1 relative overflow-hidden bg-black touch-none select-none"
  onWheel={handleWheel}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
  onPointerLeave={handlePointerUp}
>
        <div
          className="absolute inset-0 origin-center"
          style={{
            transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`
          }}
        >
          <Canvas
            className="absolute inset-0 w-full h-full"
            gl={{ antialias: true, alpha: false }}
            onCreated={({ gl }) => gl.setClearColor('#000000')}
          >
            <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
            <FixedCamera cameraState={currentSketch.cameraState} />
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