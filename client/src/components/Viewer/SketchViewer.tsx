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

interface AudioNote {
  id: number;
  dataUrl: string;
  mimeType: string;
  createdAt: string;
}

type Point = { x: number; y: number };

type CanvasDrawing =
  | { type: 'ruler'; points: Point[]; value: number }
  | { type: 'angle'; points: Point[]; value: number }
  | { type: 'circle'; points: Point[]; value: number }
  | { type: 'brush'; points: Point[]; color: string }
  | { type: 'text'; target: Point; labelPos: Point; textId: number; color: string; fontSize: number };

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
  canvasData?: CanvasDrawing[];
  textNotes?: TextNote[];
  audioNotes?: AudioNote[];
}

// ========== Константы и утилиты ==========
const DEFAULT_MODEL_COLOR = '#cccccc';
const DEFAULT_POSITION: Vector3Tuple = [0, 0, 0];
const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];

const clampOpacity = (value: number) => Math.min(1, Math.max(0, value));

const getCircleGeometry = (points: Point[]) => {
  if (points.length < 3) return null;

  const [point1, point2, point3] = points;
  const determinant =
    2 * (point1.x * (point2.y - point3.y) + point2.x * (point3.y - point1.y) + point3.x * (point1.y - point2.y));
  if (Math.abs(determinant) < 1e-10) return null;

  const point1Squared = point1.x * point1.x + point1.y * point1.y;
  const point2Squared = point2.x * point2.x + point2.y * point2.y;
  const point3Squared = point3.x * point3.x + point3.y * point3.y;
  const centerX =
    (point1Squared * (point2.y - point3.y) +
      point2Squared * (point3.y - point1.y) +
      point3Squared * (point1.y - point2.y)) /
    determinant;
  const centerY =
    (point1Squared * (point3.x - point2.x) +
      point2Squared * (point1.x - point3.x) +
      point3Squared * (point2.x - point1.x)) /
    determinant;
  const radius = Math.hypot(point1.x - centerX, point1.y - centerY);

  return { centerX, centerY, radius };
};

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

const ModelNormalizer: React.FC<{
  modelsGroupRef: React.RefObject<THREE.Group | null>;
  resetKey: string;
}> = ({ modelsGroupRef, resetKey }) => {
  const normalizedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    normalizedKeyRef.current = null;
    modelsGroupRef.current?.position.set(0, 0, 0);
  }, [modelsGroupRef, resetKey]);

  useFrame(() => {
    if (normalizedKeyRef.current === resetKey || !modelsGroupRef.current) return;

    modelsGroupRef.current.position.set(0, 0, 0);
    modelsGroupRef.current.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(modelsGroupRef.current);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);
    modelsGroupRef.current.position.copy(center.clone().negate());
    normalizedKeyRef.current = resetKey;
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
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });

  // Состояние и рефы для панорамирования/масштабирования
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const activeTouchPointersRef = useRef<Set<number>>(new Set());

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const scaleChange = e.deltaY > 0 ? 0.95 : 1.05;
    setViewState(prev => ({
      ...prev,
      scale: Math.max(0.2, Math.min(prev.scale * scaleChange, 5))
    }));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activeTouchPointersRef.current.add(e.pointerId);

      if (activeTouchPointersRef.current.size > 1) {
        isDragging.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    e.preventDefault();  
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragStart.current = { x: e.clientX - viewState.x, y: e.clientY - viewState.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && activeTouchPointersRef.current.size > 1) {
      isDragging.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();  
    if (!isDragging.current) return;
    setViewState(prev => ({
      ...prev,
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    }));
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e?.pointerType === 'touch') {
      activeTouchPointersRef.current.delete(e.pointerId);
    }

    isDragging.current = false;
  };

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const modelsGroupRef = useRef<THREE.Group>(null);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const preventNativeScroll = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    container.addEventListener('wheel', preventNativeScroll, { passive: false });
    return () => container.removeEventListener('wheel', preventNativeScroll);
  }, []);

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

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const updateSize = () => {
      setViewerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

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
      <div className="flex h-[100dvh] items-center justify-center bg-gray-900 p-4 text-center text-white">
        Загрузка эскизов...
      </div>
    );
  }

  if (!project || sketches.length === 0 || !currentSketch) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-gray-900 p-4 text-center text-red-500">
        Нет сохранённых эскизов
      </div>
    );
  }

  const anchorWidth = currentSketch.cameraState?.viewportWidth || canvasContainerRef.current?.clientWidth || 800;
  const anchorHeight = currentSketch.cameraState?.viewportHeight || canvasContainerRef.current?.clientHeight || 600;
  const currentCanvasWidth = viewerSize.width || canvasContainerRef.current?.clientWidth || anchorWidth;
  const currentCanvasHeight = viewerSize.height || canvasContainerRef.current?.clientHeight || anchorHeight;
  const sketchDrawings = currentSketch.canvasData || (currentSketch as any)?.canvas_data || [];
  const currentAudioNotes = currentSketch.audioNotes || (currentSketch as any)?.audio_notes || [];
  const mapPointToCurrentView = (point: Point): Point => ({
    x: currentCanvasWidth / 2 + (point.x - anchorWidth / 2),
    y: currentCanvasHeight / 2 + (point.y - anchorHeight / 2),
  });

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-900 text-white lg:flex-row">
      {/* Левая панель: список эскизов с бейджами NEW */}
      <div className="flex max-h-44 shrink-0 flex-col overflow-hidden border-b border-gray-700 bg-gray-800 p-3 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r lg:p-4">
        <h2 className="mb-3 text-lg font-bold lg:mb-4 lg:text-xl">Эскизы проекта</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
          {sketches.map((sketch) => (
            <div key={sketch.id} className="flex min-w-[13rem] items-center lg:min-w-0">
              <button
                onClick={() => handleSketchSelect(sketch)}
                className={`relative flex-1 rounded-lg p-3 text-left transition ${
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
              <div className="ml-2 flex flex-col space-y-1">
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
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-black"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
            <group ref={modelsGroupRef}>
              {stlModels.map((model, index) => (
                <STLMesh
                  key={model.id}
                  model={model}
                  index={index}
                  transparentGroupRefs={transparentGroupRefs}
                />
              ))}
              <ModelNormalizer modelsGroupRef={modelsGroupRef} resetKey={`${currentSketch.id}:${stlModels.length}`} />
            </group>
            <TransparencySorter transparentGroupRefs={transparentGroupRefs} />
          </Canvas>

          {sketchDrawings.length > 0 ? (
            <svg
              className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
              width={currentCanvasWidth}
              height={currentCanvasHeight}
            >
              {sketchDrawings.map((drawing: CanvasDrawing, index: number) => {
                if (drawing.type === 'ruler') {
                  const [pointA, pointB] = drawing.points.map(mapPointToCurrentView);

                  return (
                    <g key={index}>
                      <line x1={pointA.x} y1={pointA.y} x2={pointB.x} y2={pointB.y} stroke="#3b82f6" strokeWidth="2" />
                      <text x={pointB.x + 10} y={pointB.y} fill="#3b82f6" fontSize="16" fontWeight="bold">
                        {drawing.value} mm
                      </text>
                    </g>
                  );
                }

                if (drawing.type === 'circle') {
                  const points = drawing.points.map(mapPointToCurrentView);
                  const circle = getCircleGeometry(points);
                  if (!circle) return null;

                  return (
                    <g key={index}>
                      <circle cx={circle.centerX} cy={circle.centerY} r={circle.radius} stroke="#ef4444" strokeWidth="2" fill="none" />
                      <text
                        x={circle.centerX}
                        y={circle.centerY}
                        fill="#ef4444"
                        fontSize="16"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        Ø {drawing.value}
                      </text>
                    </g>
                  );
                }

                if (drawing.type === 'brush') {
                  const points = drawing.points.map(mapPointToCurrentView);

                  return (
                    <path
                      key={index}
                      d={`M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`}
                      stroke={drawing.color || 'red'}
                      strokeWidth="2"
                      fill="none"
                    />
                  );
                }

                if (drawing.type === 'angle') {
                  const [pointA, pointB, pointC] = drawing.points.map(mapPointToCurrentView);

                  return (
                    <g key={index}>
                      <line x1={pointA.x} y1={pointA.y} x2={pointB.x} y2={pointB.y} stroke="yellow" strokeWidth="2" />
                      <line x1={pointB.x} y1={pointB.y} x2={pointC.x} y2={pointC.y} stroke="yellow" strokeWidth="2" />
                      <text x={pointB.x + 10} y={pointB.y - 10} fill="yellow" fontSize="16">
                        {drawing.value}°
                      </text>
                    </g>
                  );
                }

                if (drawing.type === 'text') {
                  const target = mapPointToCurrentView(drawing.target);
                  const labelPos = mapPointToCurrentView(drawing.labelPos);
                  const note = currentSketch.textNotes?.find((item) => item.id === drawing.textId);
                  const displayText = note ? String(drawing.textId) : '?';

                  return (
                    <g key={index}>
                      <line
                        x1={target.x}
                        y1={target.y}
                        x2={labelPos.x}
                        y2={labelPos.y}
                        stroke={drawing.color}
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                      <circle cx={target.x} cy={target.y} r={3} fill={drawing.color} />
                      <text
                        x={labelPos.x}
                        y={labelPos.y}
                        fill={drawing.color}
                        fontSize={drawing.fontSize}
                        fontFamily="Arial, sans-serif"
                        fontWeight="bold"
                        alignmentBaseline="middle"
                        textAnchor="start"
                      >
                        {displayText}
                      </text>
                    </g>
                  );
                }

                return null;
              })}
            </svg>
          ) : (
            svgContent && (
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
            )
          )}
        </div>
      </div>

      {/* Правая панель: комментарии врача */}
      <div className="max-h-52 shrink-0 overflow-y-auto border-t border-gray-700 bg-gray-800 p-3 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0 lg:p-4">
        <h3 className="mb-3 flex items-center text-base font-semibold text-blue-400 lg:mb-4 lg:text-lg">
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

        <div className="space-y-3 lg:space-y-4">
          {(currentSketch.textNotes && currentSketch.textNotes.length > 0) || currentAudioNotes.length > 0 ? (
            <>
              {currentSketch.textNotes?.map((note) => (
                <div
                  key={`text-${note.id}`}
                  className="bg-gray-750 flex items-start space-x-3 rounded-xl border border-gray-700 p-3 shadow-md transition-colors hover:border-blue-500/50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                    {note.id}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
                      {note.text}
                    </p>
                  </div>
                </div>
              ))}

              {currentAudioNotes.map((note: AudioNote) => (
                <div
                  key={`audio-${note.id}`}
                  className="bg-gray-750 flex items-start space-x-3 rounded-xl border border-emerald-700/60 p-3 shadow-md transition-colors hover:border-emerald-500/80"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-medium text-white shadow-[0_0_12px_rgba(16,185,129,0.35)]">
                    🎤
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-emerald-300">Голосовая заметка #{note.id}</div>
                      <div className="text-[10px] text-gray-400">
                        {note.createdAt ? new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-gray-900/70 p-2">
                      <audio controls className="h-9 w-full accent-emerald-500" src={note.dataUrl}>
                        Ваш браузер не поддерживает аудио.
                      </audio>
                    </div>
                  </div>
                </div>
              ))}
            </>
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
