import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, type NavigateFunction } from 'react-router-dom';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera, ArcballControls, useProgress } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { SketchViewer } from './SketchViewer';
import logo from '../../assets/logo.jpg';
import {
  clearSession,
  getAuthHeaders,
  getAuthToken,
  getGuestSketchName,
  getSession,
  saveGuestSketchName,
  setReturnUrl,
} from '../../utils/authSession';
import { useUiTheme } from '../../utils/uiTheme';
import { MicrophoneIcon, SettingsIcon } from '../ui/AppIcons';

type ToolType = 'none' | 'ruler' | 'angle' | 'circle' | 'brush' | 'text';
type Point = { x: number; y: number };
type Vector3Tuple = [number, number, number];
type ModelId = string | number;

type Drawing =
  | { type: 'ruler'; points: Point[]; value: number }
  | { type: 'angle'; points: Point[]; value: number }
  | { type: 'circle'; points: Point[]; value: number }
  | { type: 'brush'; points: Point[]; color: string }
  | { type: 'text'; target: Point; labelPos: Point; textId: number; color: string; fontSize: number };

type MeasurementDrawing = Extract<Drawing, { type: 'ruler' | 'angle' | 'circle' }>;
type AudioNote = { id: number; dataUrl: string; mimeType: string; createdAt: string };

interface SceneStateItem {
  id: ModelId;
  visible: boolean;
  color: string;
  opacity: number;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  group?: string;
}

interface STLModel extends SceneStateItem {
  name: string;
  url: string;
  group: string;
}

interface ProjectData {
  patient_name?: string;
  doctor_display_name?: string;
  is_public?: boolean;
  scene_state?: string | SceneStateItem[];
}

interface ApiProjectResponse {
  project?: ProjectData;
  stlFiles?: Partial<STLModel>[];
}

interface CameraParams {
  worldWidth: number;
  worldHeight: number;
  zoom: number;
}

const DEFAULT_MODEL_COLOR = '#cccccc';
const DEFAULT_POSITION: Vector3Tuple = [0, 0, 0];
const DEFAULT_ROTATION: Vector3Tuple = [0, 0, 0];
const SCENE_SAVE_DELAY_MS = 350;
const RULER_THICKNESS = 40;

const VisibilityIcon: React.FC<{ visible: boolean }> = ({ visible }) => (
  visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" />
    </svg>
  )
);

const getSceneStorageKey = (projectId: string) => `viewer3d:scene:${projectId}`;

const getStoredSceneState = (projectId: string): SceneStateItem[] => {
  try {
    return parseSceneState(localStorage.getItem(getSceneStorageKey(projectId)));
  } catch {
    return [];
  }
};

const clampOpacity = (value: number) => Math.min(1, Math.max(0, value));

const isMeasurementDrawing = (drawing: Drawing): drawing is MeasurementDrawing =>
  drawing.type === 'ruler' || drawing.type === 'angle' || drawing.type === 'circle';

const parseSceneState = (value: unknown): SceneStateItem[] => {
  if (!value) return [];

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildDefaultModel = (file: Partial<STLModel>): STLModel => ({
  id: file.id ?? '',
  name: file.name ?? '',
  url: file.url ?? '',
  visible: file.visible ?? true,
  opacity: clampOpacity(Number(file.opacity ?? 1)),
  color: typeof file.color === 'string' ? file.color : DEFAULT_MODEL_COLOR,
  position: [...DEFAULT_POSITION],
  rotation: [...DEFAULT_ROTATION],
  group: file.group || 'Без группы',
});

const serializeSceneState = (models: STLModel[]): SceneStateItem[] =>
  models.map((model) => ({
    id: model.id,
    visible: model.visible,
    color: model.color,
    opacity: clampOpacity(model.opacity),
    position: model.position,
    rotation: model.rotation,
  }));

const mergeModelsWithState = (files: Partial<STLModel>[], sceneState: SceneStateItem[]): STLModel[] =>
  files.map((file) => {
    const defaults = buildDefaultModel(file);
    const saved = sceneState.find((item) => item.id === defaults.id);

    if (!saved) {
      return defaults;
    }

    return {
      ...defaults,
      ...saved,
      opacity: clampOpacity(saved.opacity),
      position: Array.isArray(saved.position) ? saved.position : defaults.position,
      rotation: Array.isArray(saved.rotation) ? saved.rotation : defaults.rotation,
    };
  });

const getStep = (worldSpan: number, pixelSpan: number, minPxPerMajor = 80): number => {
  const roughStep = worldSpan / (pixelSpan / minPxPerMajor);
  if (roughStep <= 0 || !Number.isFinite(roughStep)) return 10;

  const exponent = Math.floor(Math.log10(roughStep));
  const base = Math.pow(10, exponent);
  const normalized = roughStep / base;

  if (normalized < 1.5) return base;
  if (normalized < 3.5) return 2 * base;
  if (normalized < 7.5) return 5 * base;
  return 10 * base;
};

const formatValue = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
};

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

const CameraTracker = ({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null> }) => {
  const { camera } = useThree();

  useEffect(() => {
    cameraRef.current = camera as THREE.OrthographicCamera;
  }, [camera, cameraRef]);

  return null;
};

const STLMesh: React.FC<{
  model: STLModel;
  transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  index: number;
}> = ({ model, transparentGroupRefs, index }) => {
  const loaded = useLoader(STLLoader, model.url);
  const geometries = Array.isArray(loaded) ? loaded : [loaded];
  const isTransparent = model.opacity < 0.99;

  const rotationInRadians: Vector3Tuple = [
    THREE.MathUtils.degToRad(model.rotation[0]),
    THREE.MathUtils.degToRad(model.rotation[1]),
    THREE.MathUtils.degToRad(model.rotation[2]),
  ];

  return (
    <group
      position={model.position}
      rotation={rotationInRadians}
      visible={model.visible}
      userData={{ transparent: isTransparent }}
      ref={(element) => {
        transparentGroupRefs.current[index] = isTransparent ? element : null;
      }}
    >
      {geometries.map((geometry, geometryIndex) =>
        isTransparent ? (
          <React.Fragment key={geometryIndex}>
            <mesh geometry={geometry} renderOrder={1}>
              <meshStandardMaterial
                color={model.color}
                transparent
                opacity={model.opacity}
                side={THREE.BackSide}
                depthWrite
                depthTest
              />
            </mesh>
            <mesh geometry={geometry} renderOrder={2}>
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
          <mesh key={geometryIndex} geometry={geometry}>
            <meshStandardMaterial color={model.color} side={THREE.DoubleSide} />
          </mesh>
        )
      )}
    </group>
  );
};

const TransparencySorter = ({
  transparentGroupRefs,
  cameraRef,
}: {
  transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
}) => {
  useFrame(() => {
    if (!cameraRef.current) return;

    const cameraPosition = cameraRef.current.position;
    const groups = transparentGroupRefs.current.filter((group): group is THREE.Group => group !== null);
    if (groups.length === 0) return;

    groups.sort((a, b) => cameraPosition.distanceTo(b.position) - cameraPosition.distanceTo(a.position));
    groups.forEach((group, index) => {
      group.renderOrder = 100 + index;
    });
  });

  return null;
};

const CameraParamsUpdater: React.FC<{
  cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
  onUpdate: (params: CameraParams) => void;
}> = ({ cameraRef, onUpdate }) => {
  const lastRef = useRef('');

  useFrame(() => {
    if (!cameraRef.current) return;

    const camera = cameraRef.current;
    const worldWidth = Math.abs(camera.right - camera.left) / camera.zoom;
    const worldHeight = Math.abs(camera.top - camera.bottom) / camera.zoom;
    const key = `${worldWidth.toFixed(4)},${worldHeight.toFixed(4)},${camera.zoom.toFixed(4)}`;

    if (key === lastRef.current) return;
    lastRef.current = key;

    onUpdate({
      worldWidth,
      worldHeight,
      zoom: camera.zoom,
    });
  });

  return null;
};

const Rulers: React.FC<{
  cameraParams: CameraParams | null;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}> = ({ cameraParams, viewportRef }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!viewportRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [viewportRef]);

  if (!cameraParams || size.width === 0 || size.height === 0) {
    return null;
  }

  const { worldWidth, worldHeight } = cameraParams;
  const halfWorldWidth = worldWidth / 2;
  const halfWorldHeight = worldHeight / 2;
  const stepX = getStep(worldWidth, size.width);
  const stepY = getStep(worldHeight, size.height);

  const startX = Math.floor(-halfWorldWidth / stepX) * stepX;
  const endX = Math.ceil(halfWorldWidth / stepX) * stepX;
  const startY = Math.floor(-halfWorldHeight / stepY) * stepY;
  const endY = Math.ceil(halfWorldHeight / stepY) * stepY;

  const ticksX: { value: number; x: number }[] = [];
  for (let value = startX; value <= endX; value += stepX) {
    const x = ((value + halfWorldWidth) / worldWidth) * size.width;
    if (x >= RULER_THICKNESS && x <= size.width) {
      ticksX.push({ value, x });
    }
  }

  const ticksY: { value: number; y: number }[] = [];
  for (let value = startY; value <= endY; value += stepY) {
    const y = size.height - ((value + halfWorldHeight) / worldHeight) * size.height;
    if (y >= 0 && y <= size.height - RULER_THICKNESS) {
      ticksY.push({ value, y });
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 15,
        overflow: 'hidden',
      }}
    >
      <svg width="100%" height={RULER_THICKNESS} style={{ position: 'absolute', bottom: 0, left: 0, overflow: 'hidden' }}>
        <rect x="0" y="0" width="100%" height={RULER_THICKNESS} fill="rgba(30,30,30,0.85)" />
        <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        {ticksX.map((tick, index) => {
          const halfTickX = ((tick.value - stepX / 2 + halfWorldWidth) / worldWidth) * size.width;

          return (
            <g key={`horizontal-${index}`}>
              {halfTickX >= RULER_THICKNESS && halfTickX <= size.width && (
                <line x1={halfTickX} y1="0" x2={halfTickX} y2="5" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              )}
              <line x1={tick.x} y1="0" x2={tick.x} y2="10" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
              <text x={tick.x} y="22" fill="rgba(255,255,255,0.8)" fontSize="9" textAnchor="middle" fontFamily="monospace">
                {formatValue(tick.value)}
              </text>
            </g>
          );
        })}
      </svg>

      <svg width={RULER_THICKNESS} height="100%" style={{ position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
        <rect x="0" y="0" width={RULER_THICKNESS} height="100%" fill="rgba(30,30,30,0.85)" />
        <line x1={RULER_THICKNESS} y1="0" x2={RULER_THICKNESS} y2="100%" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        {ticksY.map((tick, index) => {
          const halfTickY =
            size.height - ((tick.value + stepY / 2 + halfWorldHeight) / worldHeight) * size.height;

          return (
            <g key={`vertical-${index}`}>
              {halfTickY >= 0 && halfTickY <= size.height - RULER_THICKNESS && (
                <line x1={RULER_THICKNESS - 5} y1={halfTickY} x2={RULER_THICKNESS} y2={halfTickY} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              )}
              <line x1={RULER_THICKNESS - 10} y1={tick.y} x2={RULER_THICKNESS} y2={tick.y} stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
              <text
                x={RULER_THICKNESS - 12}
                y={tick.y + 3}
                fill="rgba(255,255,255,0.8)"
                fontSize="9"
                textAnchor="end"
                dominantBaseline="middle"
                fontFamily="monospace"
              >
                {formatValue(tick.value)}
              </text>
            </g>
          );
        })}
      </svg>

      <svg width={RULER_THICKNESS} height={RULER_THICKNESS} style={{ position: 'absolute', bottom: 0, left: 0, overflow: 'hidden' }}>
        <rect x="0" y="0" width={RULER_THICKNESS} height={RULER_THICKNESS} fill="rgba(30,30,30,0.95)" />
        <line x1={RULER_THICKNESS} y1="0" x2={RULER_THICKNESS} y2={RULER_THICKNESS} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
        <line x1="0" y1="0" x2={RULER_THICKNESS} y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
};

/* 
  LoadWatcher: компонент внутри Canvas.
  Сообщает родителю актуальное состояние загрузки.
*/
const LoadWatcher: React.FC<{
  onStateChange: (state: { loading: boolean; progress: number }) => void;
}> = ({ onStateChange }) => {
  const { active, progress } = useProgress();

  useEffect(() => {
    onStateChange({ loading: active || progress < 100, progress });
  }, [active, progress, onStateChange]);

  return null;
};

/*
  ModelNormalizer: после полной загрузки моделей вычисляет их общий Bounding Box
  и сдвигает всю группу так, чтобы геометрический центр оказался в (0,0,0).
  Выполняется один раз, при последующих изменениях моделей не срабатывает.
*/
const ModelNormalizer: React.FC<{
  modelsGroupRef: React.RefObject<THREE.Group | null>; 
}> = ({ modelsGroupRef }) => {
  const { active, progress } = useProgress();
  const modelsLoading = active || progress < 100;
  const normalizedRef = useRef(false);

  useEffect(() => {
    if (normalizedRef.current || modelsLoading || !modelsGroupRef.current) return;

    const box = new THREE.Box3().setFromObject(modelsGroupRef.current);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    box.getCenter(center);

    // Смещаем группу так, чтобы центр оказался в (0,0,0)
    modelsGroupRef.current.position.copy(center.clone().negate());
    normalizedRef.current = true;
  }, [modelsLoading, modelsGroupRef]);

  return null;
};

const Viewer3DScene: React.FC<{
  projectId: string;
  currentPath: string;
  navigate: NavigateFunction;
}> = ({ projectId, currentPath, navigate }) => {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [stlModels, setStlModels] = useState<STLModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [circlePreviewPoint, setCirclePreviewPoint] = useState<Point | null>(null);
  const [editableDrawingIndex, setEditableDrawingIndex] = useState<number | null>(null);
  const [isDrawingBrush, setIsDrawingBrush] = useState(false);
  const [textNotes, setTextNotes] = useState<{ id: number; text: string }[]>([]);
  const [textCounter, setTextCounter] = useState(0);
  const [audioNotes, setAudioNotes] = useState<AudioNote[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [cameraParams, setCameraParams] = useState<CameraParams | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const { currentAccent } = useUiTheme();

  // Состояние загрузки, обновляемое LoadWatcher'ом внутри Canvas
  const [loadingState, setLoadingState] = useState({ loading: true, progress: 0 });
  const modelsLoading = loadingState.loading;

  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const modelsGroupRef = useRef<THREE.Group>(null);
  const lastTouchEndTimeRef = useRef(0);
  const latestModelsRef = useRef<STLModel[]>([]);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPointsRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const measurementDragRef = useRef<{ drawingIndex: number; pointIndex: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioStopRequestedRef = useRef(false);
  const audioRecordingStartedAtRef = useRef(0);
  const gestureModeRef = useRef<'none' | 'tool' | 'controls'>('none');
  const viewportSizeRef = useRef({ width: 0, height: 0 });

  const tools = useMemo(
    () => [
      { id: 'ruler', icon: '↔', label: 'Линейка' },
      { id: 'angle', icon: '∠', label: 'Угол' },
      { id: 'circle', icon: '○', label: 'Окружность' },
      { id: 'brush', icon: '✎', label: 'Кисть' },
      { id: 'text', icon: 'T', label: 'Текст' },
    ] as const,
    []
  );

  const persistSceneStateLocally = useCallback(
    (models: STLModel[]) => {
      try {
        localStorage.setItem(getSceneStorageKey(projectId), JSON.stringify(serializeSceneState(models)));
      } catch {
        // Local scene cache is best-effort; server sync still handles authenticated users.
      }
    },
    [projectId]
  );

  const flushSceneStateToServer = useCallback(
    (models: STLModel[], keepalive = false) => {
      const token = getAuthToken();
      if (!token) return;

      void fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/scene`, {
        method: 'PUT',
        keepalive,
        headers: getAuthHeaders(),
        body: JSON.stringify({ sceneState: serializeSceneState(models) }),
      }).catch((err) => console.error("Ошибка сохранения:", err));
    },
    [projectId]
  );

  const scheduleSceneStateSync = useCallback(
    (models: STLModel[]) => {
      latestModelsRef.current = models;

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        flushSceneStateToServer(latestModelsRef.current);
      }, SCENE_SAVE_DELAY_MS);
    },
    [flushSceneStateToServer]
  );

  const getPointFromClient = useCallback((clientX: number, clientY: number): Point | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const unprojectPoint = useCallback((point: Point): THREE.Vector3 => {
    if (!cameraRef.current || !viewportRef.current) {
      return new THREE.Vector3();
    }

    const rect = viewportRef.current.getBoundingClientRect();
    const ndcX = (point.x / rect.width) * 2 - 1;
    const ndcY = -(point.y / rect.height) * 2 + 1;

    return new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cameraRef.current);
  }, []);

  const calculateDistance = useCallback(
    (pointA: Point, pointB: Point) => unprojectPoint(pointA).distanceTo(unprojectPoint(pointB)),
    [unprojectPoint]
  );

  const calculateAngle = useCallback(
    (pointA: Point, pointB: Point, pointC: Point) => {
      const vectorA = unprojectPoint(pointA).sub(unprojectPoint(pointB));
      const vectorB = unprojectPoint(pointC).sub(unprojectPoint(pointB));
      return THREE.MathUtils.radToDeg(vectorA.angleTo(vectorB));
    },
    [unprojectPoint]
  );

  const calculateCircleDiameter = useCallback(
    (pointA: Point, pointB: Point, pointC: Point): number => {
      const vectorA = unprojectPoint(pointA);
      const vectorB = unprojectPoint(pointB);
      const vectorC = unprojectPoint(pointC);

      const sideA = vectorB.distanceTo(vectorC);
      const sideB = vectorA.distanceTo(vectorC);
      const sideC = vectorA.distanceTo(vectorB);
      const semiperimeter = (sideA + sideB + sideC) / 2;
      const area = Math.sqrt(semiperimeter * (semiperimeter - sideA) * (semiperimeter - sideB) * (semiperimeter - sideC));

      if (area < 1e-6) return 0;

      return (sideA * sideB * sideC) / (2 * area);
    },
    [unprojectPoint]
  );

  useEffect(() => {
    currentPointsRef.current = currentPoints;
  }, [currentPoints]);

  const handleToolPoint = useCallback(
    (point: Point) => {
      if (activeTool === 'none' || activeTool === 'brush') return;

      if (activeTool === 'text') {
        if (currentPoints.length === 0) {
          setCurrentPoints([point]);
          return;
        }

        const userText = window.prompt(' ');
        if (userText && userText.trim() !== '') {
          const newId = textCounter + 1;
          setTextCounter(newId);
          setTextNotes((previous) => [...previous, { id: newId, text: userText }]);
          setDrawings((previous) => [
            ...previous,
            {
              type: 'text',
              target: currentPoints[0],
              labelPos: point,
              textId: newId,
              color: '#ff0000',
              fontSize: 16,
            },
          ]);
        }

        setCurrentPoints([]);
        return;
      }

      if (activeTool === 'ruler') {
        if (currentPoints.length === 0) {
          setCurrentPoints([point]);
          setEditableDrawingIndex(null);
          return;
        }

        const distance = calculateDistance(currentPoints[0], point);
        setDrawings((previous) => {
          const nextDrawings = [
            ...previous,
            { type: 'ruler' as const, points: [currentPoints[0], point], value: Number(distance.toFixed(1)) },
          ];
          setEditableDrawingIndex(nextDrawings.length - 1);
          return nextDrawings;
        });
        setCurrentPoints([]);
        return;
      }

      if (activeTool === 'circle') {
        const points = [...currentPoints, point];

        if (points.length === 3) {
          const diameter = calculateCircleDiameter(points[0], points[1], points[2]);
          if (diameter > 0) {
            setDrawings((previous) => {
              const nextDrawings = [...previous, { type: 'circle' as const, points, value: Number(diameter.toFixed(1)) }];
              setEditableDrawingIndex(nextDrawings.length - 1);
              return nextDrawings;
            });
          }
          setCirclePreviewPoint(null);
          setCurrentPoints([]);
          return;
        }

        setCurrentPoints(points);
        setCirclePreviewPoint(null);
        if (points.length === 1) {
          setEditableDrawingIndex(null);
        }
        return;
      }

      if (activeTool === 'angle') {
        const points = [...currentPoints, point];
        if (points.length < 3) {
          setCurrentPoints(points);
          if (points.length === 1) {
            setEditableDrawingIndex(null);
          }
        } else {
          const angle = calculateAngle(points[0], points[1], points[2]);
          setDrawings((previous) => {
            const nextDrawings = [...previous, { type: 'angle' as const, points, value: Number(angle.toFixed(1)) }];
            setEditableDrawingIndex(nextDrawings.length - 1);
            return nextDrawings;
          });
          setCurrentPoints([]);
        }
      }
    },
    [activeTool, calculateAngle, calculateCircleDiameter, calculateDistance, currentPoints, textCounter]
  );

  useEffect(() => {
    if (!toastMessage) return;

    const timeoutId = window.setTimeout(() => setToastMessage(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    setLoading(true);
    setAccessError('');

    fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(async (response) => {
        if (response.status === 401) {
          clearSession();
          setReturnUrl(currentPath);
          navigate('/', { replace: true });
          throw new Error('Unauthorized');
        }

        if (response.status === 403) {
          const error = await response.json().catch(() => ({}));
          setAccessError(error.message || 'Доступ запрещен');
          throw new Error('Forbidden');
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          setAccessError(error.message || 'Проект не найден');
          throw new Error('Project load failed');
        }

        return (await response.json()) as ApiProjectResponse;
      })
      .then((data) => {
        if (!data.project) return;

        setProject(data.project);

        const serverSceneState = parseSceneState(data.project.scene_state);
        const localSceneState = getStoredSceneState(projectId);
        const sceneState = serverSceneState.length > 0 ? serverSceneState : localSceneState;
        const mergedModels = mergeModelsWithState(data.stlFiles ?? [], sceneState);

        latestModelsRef.current = mergedModels;
        transparentGroupRefs.current = new Array(mergedModels.length).fill(null);
        persistSceneStateLocally(mergedModels);
        setStlModels(mergedModels);
      })
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
      });
  }, [currentPath, navigate, persistSceneStateLocally, projectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showModelSettings || !settingsPanelRef.current) return;
      if (!settingsPanelRef.current.contains(event.target as Node)) {
        setShowModelSettings(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelSettings]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }

      if (latestModelsRef.current.length > 0) {
        flushSceneStateToServer(latestModelsRef.current, true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [flushSceneStateToServer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportSize = () => {
      viewportSizeRef.current = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      };
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, []);

  const handleLogin = () => {
  setReturnUrl(currentPath);
  navigate('/', { replace: true });
};

  const updateModelProperty = (modelId: ModelId, field: 'color' | 'opacity', value: string | number) => {
    setStlModels((previousModels) => {
      const normalizedValue = field === 'opacity' ? clampOpacity(Number(value)) : String(value);
      const updatedModels = previousModels.map((model) =>
        model.id === modelId ? { ...model, [field]: normalizedValue } : model
      );

      persistSceneStateLocally(updatedModels);
      scheduleSceneStateSync(updatedModels);
      return updatedModels;
    });
  };

  const updateModelVisibility = (modelId: ModelId, visible: boolean) => {
    setStlModels((previousModels) => {
      const updatedModels = previousModels.map((model) =>
        model.id === modelId ? { ...model, visible } : model
      );

      persistSceneStateLocally(updatedModels);
      scheduleSceneStateSync(updatedModels);
      return updatedModels;
    });
  };

  const toggleGroupVisibility = (groupName: string) => {
    setStlModels((previousModels) => {
      const anyVisible = previousModels.some((m) => m.group === groupName && m.visible);
      const newVisibility = !anyVisible;

      const updatedModels = previousModels.map((model) =>
        model.group === groupName ? { ...model, visible: newVisibility } : model
      );

      persistSceneStateLocally(updatedModels);
      scheduleSceneStateSync(updatedModels);
      return updatedModels;
    });
  };

  const handleCameraUpdate = useCallback((params: CameraParams) => {
    setCameraParams(params);
  }, []);

  const handleLogout = () => {
    clearSession();
    setReturnUrl(currentPath);
    navigate('/', { replace: true });
  };

  const startAudioRecording = useCallback(async () => {
    if (isRecordingAudio) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      window.alert('Запись аудио не поддерживается этим браузером.');
      return;
    }

    try {
      audioStopRequestedRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      audioChunksRef.current = [];
      audioStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const recordedMimeType = recorder.mimeType || 'audio/webm';
        const recordingDuration = Date.now() - audioRecordingStartedAtRef.current;
        audioChunksRef.current = [];
        audioStopRequestedRef.current = false;
        audioRecordingStartedAtRef.current = 0;
        audioStreamRef.current?.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingAudio(false);

        if (recordingDuration < 500) {
          setToastMessage('Зажмите кнопку микрофона для записи.');
          return;
        }

        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: recordedMimeType });
        if (blob.size === 0) return;

        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!dataUrl) return;

          setAudioNotes((previous) => {
            const nextId = previous.reduce((maxId, note) => Math.max(maxId, note.id), 0) + 1;
            return [
              ...previous,
              {
                id: nextId,
                dataUrl,
                mimeType: recordedMimeType,
                createdAt: new Date().toISOString(),
              },
            ];
          });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      audioRecordingStartedAtRef.current = Date.now();
      setIsRecordingAudio(true);

      if (audioStopRequestedRef.current) {
        recorder.stop();
      }
    } catch {
      setIsRecordingAudio(false);
      window.alert('Не удалось начать запись. Проверьте доступ к микрофону.');
    }
  }, [isRecordingAudio]);

  const stopAudioRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      audioStopRequestedRef.current = true;
      return;
    }

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleUndoDraw = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints([]);
      setCirclePreviewPoint(null);
      setIsDrawingBrush(false);
      return;
    }

    const lastDrawing = drawings[drawings.length - 1];
    if (lastDrawing?.type === 'text') {
      setTextNotes((previous) => previous.filter((note) => note.id !== lastDrawing.textId));
    }

    if (drawings.length > 0) {
      setDrawings((previous) => previous.slice(0, -1));
    } else if (audioNotes.length > 0) {
      setAudioNotes((previous) => previous.slice(0, -1));
    }
    setEditableDrawingIndex(null);
  };

  const handleClearAll = () => {
    if (!window.confirm('Удалить все пометки?')) return;

    setDrawings([]);
    setCurrentPoints([]);
    setCirclePreviewPoint(null);
    setEditableDrawingIndex(null);
    setTextNotes([]);
    setAudioNotes([]);
    setIsDrawingBrush(false);
  };

  const handleFinish = async () => {
    if (drawings.length === 0 && audioNotes.length === 0) {
      window.alert('Нет заметок для сохранения.');
      return;
    }

    if (!window.confirm('Сохранить пометки?')) {
      return;
    }

    const session = getSession();
    let guestName = '';

    if (!session) {
      if (!project?.is_public) {
        window.alert('Чтобы сохранить пометки в закрытой сцене, войдите в систему.');
        return;
      }

      guestName = getGuestSketchName();
      if (!guestName) {
        const enteredName = window.prompt('Как вас подписать под эскизом?');
        if (enteredName === null) return;

        guestName = saveGuestSketchName(enteredName);
        if (!guestName) {
          window.alert('Введите имя, которым подписать эскиз.');
          return;
        }
      }
    }

    const rect = viewportRef.current?.getBoundingClientRect();

    const cameraState = cameraRef.current
      ? {
          position: cameraRef.current.position.toArray(),
          rotation: cameraRef.current.rotation.toArray(),
          zoom: cameraRef.current.zoom,
          viewportWidth: rect?.width || window.innerWidth,
          viewportHeight: rect?.height || window.innerHeight,
        }
      : {};

    const payload = {
      cameraState,
      canvasData: drawings,
      textNotes,
      audioNotes,
      svgContent: svgRef.current ? svgRef.current.outerHTML : null,
      modelsState: serializeSceneState(stlModels),
      guestName: session?.name || guestName,
    };

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketch`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        window.alert(`Ошибка: ${error.message}`);
        return;
      }

      setToastMessage('Пометки сохранены.');
      setActiveTool('none');
      setDrawings([]);
      setCurrentPoints([]);
      setCirclePreviewPoint(null);
      setEditableDrawingIndex(null);
      setTextNotes([]);
      setAudioNotes([]);
      setIsDrawingBrush(false);
    } catch {
      window.alert('Ошибка сети.');
    }
  };

  const isInteractiveUiTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, input, select, textarea, [data-ui-control="true"]'));
  };

  const updateMeasurementPoint = useCallback(
    (drawingIndex: number, pointIndex: number, point: Point) => {
      setDrawings((previous) =>
        previous.map((drawing, index) => {
          if (index !== drawingIndex) return drawing;
          if (!isMeasurementDrawing(drawing)) return drawing;
          if (pointIndex < 0 || pointIndex >= drawing.points.length) return drawing;

          const points = drawing.points.map((existingPoint: Point, existingIndex: number) =>
            existingIndex === pointIndex ? point : existingPoint
          );

          if (drawing.type === 'ruler') {
            const distance = calculateDistance(points[0], points[1]);

            return {
              ...drawing,
              points,
              value: Number(distance.toFixed(1)),
            };
          }

          if (drawing.type === 'angle') {
            const angle = calculateAngle(points[0], points[1], points[2]);

            return {
              ...drawing,
              points,
              value: Number(angle.toFixed(1)),
            };
          }

          const diameter = calculateCircleDiameter(points[0], points[1], points[2]);

          return {
            ...drawing,
            points,
            value: diameter > 0 ? Number(diameter.toFixed(1)) : drawing.value,
          };
        })
      );
    },
    [calculateAngle, calculateCircleDiameter, calculateDistance]
  );

  const getMeasurementHandleAtPoint = useCallback(
    (point: Point) => {
      if (!['ruler', 'angle', 'circle'].includes(activeTool)) return null;

      for (let drawingIndex = drawings.length - 1; drawingIndex >= 0; drawingIndex--) {
        const drawing = drawings[drawingIndex];
        if (drawing.type !== activeTool) continue;
        if (!isMeasurementDrawing(drawing)) continue;

        for (let pointIndex = drawing.points.length - 1; pointIndex >= 0; pointIndex--) {
          if (drawing.type === 'circle' && pointIndex !== 2) continue;

          const handlePoint = drawing.points[pointIndex];
          if (Math.hypot(point.x - handlePoint.x, point.y - handlePoint.y) <= 24) {
            return { drawingIndex, pointIndex };
          }
        }
      }

      return null;
    },
    [activeTool, drawings]
  );

  const handlePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveUiTarget(event.target)) return;

    if (event.pointerType === 'touch') {
      activeTouchPointersRef.current.add(event.pointerId);
    }

    if (activeTool === 'none') {
      gestureModeRef.current = 'controls';
      return;
    }

    if (event.pointerType === 'touch' && activeTouchPointersRef.current.size > 1) {
      gestureModeRef.current = 'tool';
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const point = getPointFromClient(event.clientX, event.clientY);
    if (!point) return;

    const measurementHandle = getMeasurementHandleAtPoint(point);
    if (measurementHandle) {
      activePointerIdRef.current = event.pointerId;
      measurementDragRef.current = measurementHandle;
      setEditableDrawingIndex(measurementHandle.drawingIndex);
      gestureModeRef.current = 'tool';
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    activePointerIdRef.current = event.pointerId;
    gestureModeRef.current = 'tool';

    if (activeTool === 'brush') {
      setIsDrawingBrush(true);
      setCurrentPoints([point]);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (activeTool === 'circle' && currentPointsRef.current.length === 2) {
      setCirclePreviewPoint(point);
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'none' && event.pointerType === 'touch' && activeTouchPointersRef.current.size > 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (gestureModeRef.current !== 'tool') return;
    if (activePointerIdRef.current !== event.pointerId) return;

    const point = getPointFromClient(event.clientX, event.clientY);
    if (!point) return;

    if (measurementDragRef.current) {
      updateMeasurementPoint(measurementDragRef.current.drawingIndex, measurementDragRef.current.pointIndex, point);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (activeTool === 'circle' && currentPointsRef.current.length === 2) {
      setCirclePreviewPoint(point);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (activeTool !== 'brush') return;
    if (!isDrawingBrush) return;

    setCurrentPoints((previous) => [...previous, point]);
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerUpCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      activeTouchPointersRef.current.delete(event.pointerId);
    }

    if (gestureModeRef.current !== 'tool' || activePointerIdRef.current !== event.pointerId) {
      if (activeTouchPointersRef.current.size === 0) {
        gestureModeRef.current = activeTool === 'none' ? 'controls' : 'none';
      }
      return;
    }

    const point = getPointFromClient(event.clientX, event.clientY);
    if (!point) return;

    if (measurementDragRef.current) {
      updateMeasurementPoint(measurementDragRef.current.drawingIndex, measurementDragRef.current.pointIndex, point);
      measurementDragRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    } else if (activeTool === 'circle' && currentPointsRef.current.length === 2) {
      setCirclePreviewPoint(null);
      if (!(event.pointerType === 'mouse' && Date.now() - lastTouchEndTimeRef.current < 300)) {
        handleToolPoint(point);
      }
      if (event.pointerType === 'touch') {
        lastTouchEndTimeRef.current = Date.now();
      }
      event.preventDefault();
      event.stopPropagation();
    } else if (activeTool === 'brush') {
      setIsDrawingBrush(false);
      setDrawings((previous) => [
        ...previous,
        { type: 'brush', points: [...currentPointsRef.current, point], color: 'red' },
      ]);
      setCurrentPoints([]);
      event.preventDefault();
      event.stopPropagation();
    } else {
      if (!(event.pointerType === 'mouse' && Date.now() - lastTouchEndTimeRef.current < 300)) {
        handleToolPoint(point);
      }
      if (event.pointerType === 'touch') {
        lastTouchEndTimeRef.current = Date.now();
      }
      event.preventDefault();
      event.stopPropagation();
    }

    activePointerIdRef.current = null;
    gestureModeRef.current = activeTouchPointersRef.current.size > 0 ? 'controls' : activeTool === 'none' ? 'controls' : 'none';
  };

  const handlePointerCancelCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      activeTouchPointersRef.current.delete(event.pointerId);
    }

    if (activePointerIdRef.current === event.pointerId) {
      activePointerIdRef.current = null;
      measurementDragRef.current = null;
      setIsDrawingBrush(false);
      setCirclePreviewPoint(null);
      setCurrentPoints([]);
    }

    if (activeTouchPointersRef.current.size === 0) {
      gestureModeRef.current = activeTool === 'none' ? 'controls' : 'none';
    }
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center bg-neutral-950 text-neutral-200">
        <img src={logo} alt="MeshBridge" className="mb-4 h-24 w-56 rounded-2xl bg-white object-contain ring-1 ring-white/10" />
        <div className="h-1.5 w-56 overflow-hidden rounded-full bg-neutral-800">
          <div className="scene-loading-bar h-full w-2/5 rounded-full" style={{ backgroundColor: currentAccent.color }} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-900 p-6 text-center text-white">
        <div className="text-lg font-bold text-red-400">{accessError || 'Project not found'}</div>
        <button
          onClick={handleLogin}
          className="rounded-full px-5 py-2.5 text-sm font-black text-white shadow-lg hover:brightness-95"
          style={{ backgroundColor: currentAccent.color }}
        >
          Войти другим аккаунтом
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-neutral-950 font-sans text-white" style={{ overscrollBehavior: 'none', '--ui-accent': currentAccent.color } as React.CSSProperties}>
      <div
        ref={viewportRef}
        className="relative flex-1 items-center justify-center"
        style={{ touchAction: 'none', overscrollBehavior: 'none', WebkitOverflowScrolling: 'auto' }}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerCancelCapture={handlePointerCancelCapture}
        onWheelCapture={(event) => {
          if (activeTool === 'none') return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {(toastMessage || audioNotes.length > 0) && (
          <div className="pointer-events-none absolute right-4 top-16 z-40 flex flex-col items-end gap-2">
            {toastMessage && (
              <div className="rough-glass rough-glass-dark rounded-full px-4 py-2 text-sm font-bold text-white">
                {toastMessage}
              </div>
            )}
            {audioNotes.length > 0 && (
              <div className="rough-glass rough-glass-dark rounded-full px-4 py-2 text-sm font-bold text-white">
                Голосовых заметок: {audioNotes.length}
              </div>
            )}
          </div>
        )}

        {/* Полоса загрузки моделей */}
        {modelsLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950">
            <div className="w-56 text-center">
              <img src={logo} alt="MeshBridge" className="mb-4 h-24 w-56 rounded-2xl bg-white object-contain ring-1 ring-white/10" />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${loadingState.progress}%`, backgroundColor: currentAccent.color }}
                />
              </div>
            </div>
          </div>
        )}

        <Canvas
          className="h-full w-full"
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => gl.setClearColor('#000000')}
          style={{ touchAction: 'none' }}
        >
          <LoadWatcher onStateChange={setLoadingState} />

          <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
          <CameraTracker cameraRef={cameraRef} />

          <ArcballControls
            ref={controlsRef}
            makeDefault
            enabled={activeTool === 'none'}
            enablePan={activeTool === 'none'}
            enableRotate={activeTool === 'none'}
            enableZoom={activeTool === 'none'}
            cursorZoom={false}
            enableAnimations={true}
            focusAnimationTime={0.1}
          />

          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 50, 50]} intensity={1.5} />
          <directionalLight position={[-50, -50, -50]} intensity={0.5} />

          <Suspense fallback={null}>
            <group ref={modelsGroupRef}>
              {stlModels.map((model, index) => (
                <STLMesh key={model.id} model={model} index={index} transparentGroupRefs={transparentGroupRefs} />
              ))}

              {/* Нормализатор: центрирует группу моделей в (0,0,0) */}
              <ModelNormalizer modelsGroupRef={modelsGroupRef} />
            </group>
          </Suspense>

          <TransparencySorter transparentGroupRefs={transparentGroupRefs} cameraRef={cameraRef} />
          <CameraParamsUpdater cameraRef={cameraRef} onUpdate={handleCameraUpdate} />
        </Canvas>

        <div
          className="rough-glass rough-glass-dark absolute left-1/2 top-3 z-20 hidden max-w-[calc(100%-7rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-full px-4 py-2 text-white sm:flex"
          data-ui-control="true"
        >
          <span className="text-xs text-neutral-400">Пациент</span>
          <span className="max-w-40 truncate text-sm font-black" style={{ color: currentAccent.color }}>{project.patient_name}</span>
          <div className="hidden h-4 w-px bg-white/15 sm:block" />
          <span className="hidden text-xs text-neutral-400 sm:inline">Врач</span>
          <span className="hidden max-w-40 truncate text-sm font-bold text-white sm:inline">{project.doctor_display_name}</span>
        </div>

        {getSession() ? (
  <button
    onClick={handleLogout}
    className="rough-glass rough-glass-dark absolute left-12 top-3 z-30 rounded-full px-3 py-2 text-xs font-black text-white transition hover:border-white/30"
    data-ui-control="true"
  >
    Выйти
  </button>
) : (
  <div
    className="rough-glass rough-glass-dark absolute left-12 top-3 z-30 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-white"
    data-ui-control="true"
  >
    <span>Открытая сцена</span>
    <button
      onClick={handleLogin}
      className="rounded-full px-2.5 py-1 text-xs font-black text-white"
      style={{ backgroundColor: currentAccent.color }}
    >
      Войти
    </button>
  </div>
)}

        <button
          onClick={() => setShowModelSettings((previous) => !previous)}
          className="rough-glass rough-glass-dark absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full text-lg text-white transition hover:border-white/30"
          title="Настройки моделей"
        >
          <SettingsIcon className="h-5 w-5" />
        </button>

        {showModelSettings && (
          <div
            ref={settingsPanelRef}
            className="rough-glass rough-glass-dark absolute right-3 top-16 z-30 flex max-h-[80vh] w-[min(20rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[1.5rem] p-4"
            data-ui-control="true"
          >
            <h3 className="mb-3 shrink-0 border-b border-white/10 pb-2 text-lg font-black">Модели</h3>
            <div className="ui-dark-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
              {Object.entries(
                stlModels.reduce((acc, model) => {
                  acc[model.group] = acc[model.group] || [];
                  acc[model.group].push(model);
                  return acc;
                }, {} as Record<string, STLModel[]>)
              ).map(([groupName, groupModels]) => {
                const isAnyVisible = groupModels.some((m) => m.visible);

                return (
                  <div key={groupName} className="mb-4">
                    <div className="mb-2 flex items-center justify-between rounded-xl bg-white/7 p-2">
                      <h4 className="font-black" style={{ color: currentAccent.color }}>{groupName}</h4>
                      <button
                        onClick={() => toggleGroupVisibility(groupName)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                          isAnyVisible ? 'text-neutral-100 hover:bg-white/10' : 'text-neutral-500 hover:bg-white/6'
                        }`}
                        title={isAnyVisible ? 'Скрыть группу' : 'Показать группу'}
                      >
                        <VisibilityIcon visible={isAnyVisible} />
                      </button>
                    </div>

                    <div className="space-y-3 border-l-2 border-white/10 pl-2">
                      {groupModels.map((model) => (
                        <div key={model.id} className="rounded-xl bg-black/20 p-3 ring-1 ring-white/8">
                          <div className="flex justify-between items-center mb-2">
                            <div className="truncate text-sm font-semibold text-white" title={model.name}>
                              {model.name}
                            </div>
                            <button
                              onClick={() => updateModelVisibility(model.id, !model.visible)}
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                                model.visible ? 'text-neutral-100 hover:bg-white/10' : 'text-neutral-500 hover:bg-white/6'
                              }`}
                              title={model.visible ? 'Скрыть объект' : 'Показать объект'}
                            >
                              <VisibilityIcon visible={model.visible} />
                            </button>
                          </div>
                          <div className="mb-2 flex items-center gap-3">
                            <span className="w-12 text-xs text-gray-400">Color</span>
                            <input
                              type="color"
                              value={model.color}
                              onChange={(event) => updateModelProperty(model.id, 'color', event.target.value)}
                              className="h-8 w-8 cursor-pointer rounded border border-gray-600 bg-gray-900 p-0.5"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="w-12 text-xs text-gray-400">Opacity</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={model.opacity}
                              onChange={(event) => updateModelProperty(model.id, 'opacity', Number(event.target.value))}
                              className="flex-1"
                              style={{ accentColor: currentAccent.color }}
                            />
                            <span className="w-8 text-xs text-gray-300">{Math.round(model.opacity * 100)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Панель инструментов */}
        <div
          className="absolute bottom-12 left-1/2 z-20 w-[calc(100vw-1rem)] -translate-x-1/2"
          data-ui-control="true"
        >
          <div
            className="rough-glass rough-glass-dark liquid-toolbar-dark mx-auto flex w-max max-w-full items-center gap-1.5 rounded-full p-1.5"
          >
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id === activeTool ? 'none' : (tool.id as ToolType));
                  setCurrentPoints([]);
                  setCirclePreviewPoint(null);
                  setEditableDrawingIndex(null);
                  setIsDrawingBrush(false);
                  activePointerIdRef.current = null;
                  measurementDragRef.current = null;
                  gestureModeRef.current = 'none';
                }}
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-black ring-1 transition sm:h-11 sm:w-11 ${
                  activeTool === tool.id
                    ? 'text-white ring-transparent'
                    : 'bg-white/6 text-neutral-200 ring-transparent hover:bg-white/10 hover:ring-white/25'
                }`}
                style={activeTool === tool.id ? { backgroundColor: currentAccent.color } : undefined}
                title={tool.label}
              >
                {tool.icon}
              </button>
            ))}

            <button
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                void startAudioRecording();
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                stopAudioRecording();
              }}
              onPointerCancel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                stopAudioRecording();
              }}
              onContextMenu={(event) => event.preventDefault()}
              className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-base ring-1 transition sm:h-11 sm:w-11 ${
                isRecordingAudio ? 'bg-red-600 text-white ring-transparent' : 'bg-white/6 text-neutral-200 ring-transparent hover:bg-white/10 hover:ring-white/25'
              }`}
              title="Удерживайте для записи аудио"
            >
              <MicrophoneIcon className="h-5 w-5" />
            </button>

            <div className="mx-0.5 h-7 w-px flex-none bg-white/15" />

            <button
              onClick={handleUndoDraw}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/6 text-neutral-200 ring-1 ring-transparent transition hover:bg-white/10 hover:ring-white/25 sm:h-11 sm:w-11"
              title="Отменить"
            >
              ↶
            </button>

            <button
              onClick={handleClearAll}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-500/12 text-red-300 ring-1 ring-transparent transition hover:bg-red-500/20 hover:ring-red-400/30 sm:h-11 sm:w-11"
              title="Очистить"
            >
              ✕
            </button>
            </div>

            <button
              onClick={handleFinish}
              className="h-10 flex-none rounded-full px-4 text-xs font-black text-white shadow-md transition hover:brightness-95 sm:h-11"
              style={{ backgroundColor: currentAccent.color }}
            >
              Сохранить
            </button>
          </div>
        </div>

        {activeTool !== 'none' && (
          <div className="rough-glass rough-glass-dark pointer-events-none absolute left-1/2 top-16 z-20 w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-[10px] font-bold text-neutral-200 sm:w-auto sm:text-xs">
            {activeTool === 'text' && currentPoints.length === 0 && 'Поставьте точку указателя аннотации.'}
            {activeTool === 'text' && currentPoints.length === 1 && 'Поствте точку нумерации аннотации.'}
            {activeTool !== 'text' && `Tool: ${tools.find((tool) => tool.id === activeTool)?.label}`}
          </div>
        )}

        

        <svg ref={svgRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" style={{ touchAction: 'none' }}>
          {drawings.map((drawing, index) => {
            if (drawing.type === 'ruler') {
              return (
                <g key={index}>
                  <line
                    x1={drawing.points[0].x}
                    y1={drawing.points[0].y}
                    x2={drawing.points[1].x}
                    y2={drawing.points[1].y}
                    stroke="#3b82f6"
                    strokeWidth="2"
                  />
                  <text x={drawing.points[1].x + 10} y={drawing.points[1].y} fill="#3b82f6" fontSize="16" fontWeight="bold">
                    {drawing.value} mm
                  </text>
                  {activeTool === 'ruler' &&
                    editableDrawingIndex === index &&
                    drawing.points.map((point, pointIndex) => (
                      <circle
                        key={`ruler-handle-${pointIndex}`}
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        fill="#ffffff"
                        stroke="#3b82f6"
                        strokeWidth="2"
                      />
                    ))}
                </g>
              );
            }

            if (drawing.type === 'circle') {
              const circle = getCircleGeometry(drawing.points);
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
                  {activeTool === 'circle' &&
                    editableDrawingIndex === index &&
                    drawing.points.map((point, pointIndex) => (
                      <circle
                        key={`circle-handle-${pointIndex}`}
                        cx={point.x}
                        cy={point.y}
                        r={pointIndex === 2 ? 6 : 4}
                        fill={pointIndex === 2 ? '#ffffff' : '#ef4444'}
                        stroke="#ef4444"
                        strokeWidth="2"
                      />
                    ))}
                </g>
              );
            }

            if (drawing.type === 'brush') {
              return (
                <path
                  key={index}
                  d={`M ${drawing.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`}
                  stroke="red"
                  strokeWidth="2"
                  fill="none"
                />
              );
            }

            if (drawing.type === 'angle') {
              return (
                <g key={index}>
                  <line
                    x1={drawing.points[0].x}
                    y1={drawing.points[0].y}
                    x2={drawing.points[1].x}
                    y2={drawing.points[1].y}
                    stroke="yellow"
                    strokeWidth="2"
                  />
                  <line
                    x1={drawing.points[1].x}
                    y1={drawing.points[1].y}
                    x2={drawing.points[2].x}
                    y2={drawing.points[2].y}
                    stroke="yellow"
                    strokeWidth="2"
                  />
                  <text x={drawing.points[1].x + 10} y={drawing.points[1].y - 10} fill="yellow" fontSize="16">
                    {drawing.value}°
                  </text>
                  {activeTool === 'angle' &&
                    editableDrawingIndex === index &&
                    drawing.points.map((point, pointIndex) => (
                      <circle
                        key={`angle-handle-${pointIndex}`}
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        fill="#ffffff"
                        stroke="yellow"
                        strokeWidth="2"
                      />
                    ))}
                </g>
              );
            }

            if (drawing.type === 'text') {
              const note = textNotes.find((item) => item.id === drawing.textId);
              const displayText = note ? String(drawing.textId) : '?';

              return (
                <g key={index}>
                  <line
                    x1={drawing.target.x}
                    y1={drawing.target.y}
                    x2={drawing.labelPos.x}
                    y2={drawing.labelPos.y}
                    stroke={drawing.color}
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                  <circle cx={drawing.target.x} cy={drawing.target.y} r={3} fill={drawing.color} />
                  <text
                    x={drawing.labelPos.x}
                    y={drawing.labelPos.y}
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

          {activeTool === 'ruler' && currentPoints.length === 1 && (
            <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="blue" />
          )}

          {activeTool === 'circle' && currentPoints.length > 0 && (
            <>
              {currentPoints.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={4} fill="red" stroke="white" strokeWidth="1" />
              ))}
              {currentPoints.length === 2 && (
                <line
                  x1={currentPoints[0].x}
                  y1={currentPoints[0].y}
                  x2={currentPoints[1].x}
                  y2={currentPoints[1].y}
                  stroke="red"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              )}
              {currentPoints.length === 2 && circlePreviewPoint && (() => {
                const previewPoints = [...currentPoints, circlePreviewPoint];
                const circle = getCircleGeometry(previewPoints);
                const diameter = calculateCircleDiameter(previewPoints[0], previewPoints[1], previewPoints[2]);

                if (!circle || diameter <= 0) {
                  return (
                    <circle
                      cx={circlePreviewPoint.x}
                      cy={circlePreviewPoint.y}
                      r={4}
                      fill="white"
                      stroke="#ef4444"
                      strokeWidth="2"
                    />
                  );
                }

                return (
                  <g>
                    <circle cx={circle.centerX} cy={circle.centerY} r={circle.radius} stroke="#ef4444" strokeWidth="2" fill="none" strokeDasharray="6 4" />
                    <circle cx={circlePreviewPoint.x} cy={circlePreviewPoint.y} r={5} fill="white" stroke="#ef4444" strokeWidth="2" />
                    <text
                      x={circle.centerX}
                      y={circle.centerY}
                      fill="#ef4444"
                      fontSize="16"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      Ø {Number(diameter.toFixed(1))}
                    </text>
                  </g>
                );
              })()}
            </>
          )}

          {activeTool === 'angle' &&
            currentPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={3} fill="yellow" />)}

          {activeTool === 'brush' && currentPoints.length > 0 && (
            <path
              d={`M ${currentPoints.map((point) => `${point.x} ${point.y}`).join(' L ')}`}
              stroke="red"
              strokeWidth="2"
              fill="none"
            />
          )}

          {activeTool === 'text' && currentPoints.length === 1 && (
            <g>
              <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="#ff0000" />
              <text x={currentPoints[0].x + 10} y={currentPoints[0].y - 10} fill="white" fontSize="10" stroke="black" strokeWidth="0.5">
                Anchor
              </text>
            </g>
          )}
        </svg>

        <Rulers cameraParams={cameraParams} viewportRef={viewportRef} />
      </div>
    </div>
  );
};

export const Viewer3D: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  if (!id) {
    return <div className="flex h-[100dvh] items-center justify-center bg-gray-900 text-red-500">Missing project id</div>;
  }

  const mode = new URLSearchParams(location.search).get('mode');
  if (mode === 'sketches') {
    return <SketchViewer projectId={id} />;
  }

  return <Viewer3DScene projectId={id} currentPath={`${location.pathname}${location.search}`} navigate={navigate} />;
};
