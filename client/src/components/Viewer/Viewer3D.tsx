import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, type NavigateFunction } from 'react-router-dom';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera, ArcballControls } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';
import { SketchViewer } from './SketchViewer';

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

interface SceneStateItem {
  id: ModelId;
  visible: boolean;
  color: string;
  opacity: number;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
}

interface STLModel extends SceneStateItem {
  name: string;
  url: string;
}

interface ProjectData {
  patient_name?: string;
  doctor_display_name?: string;
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
const RULER_THICKNESS = 28;

const getSceneStorageKey = (projectId: string) => `viewer3d:scene:${projectId}`;

const clampOpacity = (value: number) => Math.min(1, Math.max(0, value));

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
  position: Array.isArray(file.position) ? (file.position as Vector3Tuple) : DEFAULT_POSITION,
  rotation: Array.isArray(file.rotation) ? (file.rotation as Vector3Tuple) : DEFAULT_ROTATION,
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
              <meshStandardMaterial color={model.color} transparent opacity={model.opacity} side={THREE.BackSide} depthWrite depthTest />
            </mesh>
            <mesh geometry={geometry} renderOrder={2}>
              <meshStandardMaterial color={model.color} transparent opacity={model.opacity} side={THREE.FrontSide} depthWrite={false} depthTest />
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
          const halfTickX = (((tick.value - stepX / 2) + halfWorldWidth) / worldWidth) * size.width;

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
          const halfTickY = size.height - (((tick.value + stepY / 2) + halfWorldHeight) / worldHeight) * size.height;

          return (
            <g key={`vertical-${index}`}>
              {halfTickY >= 0 && halfTickY <= size.height - RULER_THICKNESS && (
                <line x1={RULER_THICKNESS - 5} y1={halfTickY} x2={RULER_THICKNESS} y2={halfTickY} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              )}
              <line x1={RULER_THICKNESS - 10} y1={tick.y} x2={RULER_THICKNESS} y2={tick.y} stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
              <text x={RULER_THICKNESS - 12} y={tick.y + 3} fill="rgba(255,255,255,0.8)" fontSize="9" textAnchor="end" dominantBaseline="middle" fontFamily="monospace">
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

const Viewer3DScene: React.FC<{
  projectId: string;
  currentPath: string;
  navigate: NavigateFunction;
}> = ({ projectId, currentPath, navigate }) => {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [stlModels, setStlModels] = useState<STLModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isDrawingBrush, setIsDrawingBrush] = useState(false);
  const [textNotes, setTextNotes] = useState<{ id: number; text: string }[]>([]);
  const [textCounter, setTextCounter] = useState(0);
  const [showModelSettings, setShowModelSettings] = useState(false);
  const [cameraParams, setCameraParams] = useState<CameraParams | null>(null);

  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);
  const hasCentered = useRef(false);
  const lastTouchEndTimeRef = useRef(0);
  const latestModelsRef = useRef<STLModel[]>([]);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPointsRef = useRef<Point[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const activeTouchPointersRef = useRef<Set<number>>(new Set());
  const gestureModeRef = useRef<'none' | 'tool' | 'controls'>('none');
  const viewportSizeRef = useRef({ width: 0, height: 0 });

  const tools = useMemo(
    () => [
      { id: 'ruler', icon: '📏', label: 'Ruler' },
      { id: 'angle', icon: '∠', label: 'Angle' },
      { id: 'circle', icon: '◯', label: 'Circle' },
      { id: 'brush', icon: '✎', label: 'Brush' },
      { id: 'text', icon: 'T', label: 'Text' },
    ] as const,
    []
  );

  const persistSceneStateLocally = useCallback(
    (models: STLModel[]) => {
      try {
        localStorage.setItem(getSceneStorageKey(projectId), JSON.stringify(serializeSceneState(models)));
      } catch {}
    },
    [projectId]
  );

  const flushSceneStateToServer = useCallback(
    (models: STLModel[], keepalive = false) => {
      const token = localStorage.getItem('token');
      if (!token) return;

      void fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/scene`, {
        method: 'POST',
        keepalive,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sceneState: serializeSceneState(models) }),
      }).catch(() => undefined);
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

  const calculateDistance = useCallback((pointA: Point, pointB: Point) => unprojectPoint(pointA).distanceTo(unprojectPoint(pointB)), [unprojectPoint]);

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

        const userText = window.prompt('Введите текст');
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
          return;
        }

        const distance = calculateDistance(currentPoints[0], point);
        setDrawings((previous) => [...previous, { type: 'ruler', points: [currentPoints[0], point], value: Number(distance.toFixed(1)) }]);
        setCurrentPoints([]);
        return;
      }

      if (activeTool === 'circle') {
        const points = [...currentPoints, point];
        setCurrentPoints(points);

        if (points.length === 3) {
          const diameter = calculateCircleDiameter(points[0], points[1], points[2]);
          if (diameter > 0) {
            setDrawings((previous) => [...previous, { type: 'circle', points, value: Number(diameter.toFixed(1)) }]);
          }
          setCurrentPoints([]);
        }
        return;
      }

      if (activeTool === 'angle') {
        const points = [...currentPoints, point];
        if (points.length < 3) {
          setCurrentPoints(points);
        } else {
          const angle = calculateAngle(points[0], points[1], points[2]);
          setDrawings((previous) => [...previous, { type: 'angle', points, value: Number(angle.toFixed(1)) }]);
          setCurrentPoints([]);
        }
      }
    },
    [activeTool, calculateAngle, calculateCircleDiameter, calculateDistance, currentPoints, textCounter]
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) return;

    localStorage.setItem('returnUrl', currentPath);
    navigate('/', { replace: true });
  }, [currentPath, navigate]);

  useEffect(() => {
    hasCentered.current = false;
    transparentGroupRefs.current = [];
  }, [projectId]);

  useEffect(() => {
    setLoading(true);

    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('token');
          localStorage.setItem('returnUrl', currentPath);
          navigate('/', { replace: true });
          throw new Error('Unauthorized');
        }

        return (await response.json()) as ApiProjectResponse;
      })
      .then((data) => {
        if (!data.project) return;

        setProject(data.project);

        const serverSceneState = parseSceneState(data.project.scene_state);
        const localSceneState = parseSceneState(localStorage.getItem(getSceneStorageKey(projectId)));
        const sceneState = localSceneState.length > 0 ? localSceneState : serverSceneState;
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
    if (!controlsRef.current || !cameraRef.current || hasCentered.current || stlModels.length === 0) return;

    const loader = new STLLoader();
    let cancelled = false;

    const centerCameraOnModels = async () => {
      const worldBoxes: THREE.Box3[] = [];
      const centers: THREE.Vector3[] = [];

      await Promise.all(
        stlModels.map(async (model) => {
          try {
            const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
              loader.load(model.url, resolve, undefined, reject);
            });

            geometry.computeBoundingBox();
            const mesh = new THREE.Mesh(geometry);
            mesh.position.set(...model.position);
            mesh.rotation.set(
              THREE.MathUtils.degToRad(model.rotation[0]),
              THREE.MathUtils.degToRad(model.rotation[1]),
              THREE.MathUtils.degToRad(model.rotation[2])
            );
            mesh.updateMatrixWorld(true);

            const worldBox = new THREE.Box3().setFromObject(mesh);
            if (!worldBox.isEmpty()) {
              worldBoxes.push(worldBox);
              centers.push(worldBox.getCenter(new THREE.Vector3()));
            }
          } catch {
            return;
          }
        })
      );

      if (cancelled || worldBoxes.length === 0 || centers.length === 0 || !cameraRef.current || !controlsRef.current) {
        return;
      }

      const focus = centers.reduce((sum, center) => sum.add(center), new THREE.Vector3()).divideScalar(centers.length);
      const camera = cameraRef.current;
      const combined = new THREE.Box3();
      worldBoxes.forEach((box) => combined.union(box));

      const width = Math.max(combined.max.x - combined.min.x, 1);
      const height = Math.max(combined.max.y - combined.min.y, 1);
      const padding = 1.2;
      const baseWorldWidth = Math.abs(camera.right - camera.left) || viewportSizeRef.current.width || 1;
      const baseWorldHeight = Math.abs(camera.top - camera.bottom) || viewportSizeRef.current.height || 1;
      const zoomX = baseWorldWidth / (width * padding);
      const zoomY = baseWorldHeight / (height * padding);
      const nextZoom = Math.max(Math.min(zoomX, zoomY), 0.01);
      const distanceToTarget = camera.position.distanceTo(controlsRef.current.target || new THREE.Vector3(0, 0, 0));
      const direction = camera.position.clone().sub(controlsRef.current.target || new THREE.Vector3(0, 0, 0)).normalize();
      const safeDirection = Number.isFinite(direction.lengthSq()) && direction.lengthSq() > 0 ? direction : new THREE.Vector3(0, 0, 1);

      controlsRef.current.target.copy(focus);
      camera.position.copy(focus.clone().add(safeDirection.multiplyScalar(distanceToTarget || 150)));
      camera.zoom = nextZoom;
      camera.updateProjectionMatrix();
      controlsRef.current.update();
      hasCentered.current = true;
    };

    void centerCameraOnModels();

    return () => {
      cancelled = true;
    };
  }, [stlModels]);

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

  const updateModelProperty = (modelId: ModelId, field: 'color' | 'opacity', value: string | number) => {
    setStlModels((previousModels) => {
      const normalizedValue = field === 'opacity' ? clampOpacity(Number(value)) : String(value);
      const updatedModels = previousModels.map((model) => (model.id === modelId ? { ...model, [field]: normalizedValue } : model));

      persistSceneStateLocally(updatedModels);
      scheduleSceneStateSync(updatedModels);
      return updatedModels;
    });
  };

  const handleCameraUpdate = useCallback((params: CameraParams) => {
    setCameraParams(params);
  }, []);

  const handleUndoDraw = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints([]);
      setIsDrawingBrush(false);
      return;
    }

    const lastDrawing = drawings[drawings.length - 1];
    if (lastDrawing?.type === 'text') {
      setTextNotes((previous) => previous.filter((note) => note.id !== lastDrawing.textId));
    }

    setDrawings((previous) => previous.slice(0, -1));
  };

  const handleClearAll = () => {
    if (!window.confirm('Очистить все измерения и заметки?')) return;

    setDrawings([]);
    setCurrentPoints([]);
    setTextNotes([]);
    setIsDrawingBrush(false);
  };

  const handleFinish = async () => {
    if (drawings.length === 0) {
      window.alert('Сначала добавьте хотя бы одно измерение или заметку.');
      return;
    }

    if (!window.confirm('Сохранить текущие пометки?')) {
      return;
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
      svgContent: svgRef.current ? svgRef.current.outerHTML : null,
    };

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        window.alert(`Ошибка: ${error.message}`);
        return;
      }

      window.alert('Пометки сохранены.');
      setActiveTool('none');
      setDrawings([]);
      setCurrentPoints([]);
      setTextNotes([]);
      setIsDrawingBrush(false);
    } catch {
      window.alert('Не удалось сохранить пометки.');
    }
  };

  const isInteractiveUiTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, input, select, textarea, [data-ui-control="true"]'));
  };

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
      gestureModeRef.current = 'controls';
      return;
    }

    const point = getPointFromClient(event.clientX, event.clientY);
    if (!point) return;

    activePointerIdRef.current = event.pointerId;
    gestureModeRef.current = 'tool';

    if (activeTool === 'brush') {
      setIsDrawingBrush(true);
      setCurrentPoints([point]);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureModeRef.current !== 'tool') return;
    if (activeTool !== 'brush') return;
    if (!isDrawingBrush) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    const point = getPointFromClient(event.clientX, event.clientY);
    if (!point) return;

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

    if (activeTool === 'brush') {
      setIsDrawingBrush(false);
      setDrawings((previous) => [...previous, { type: 'brush', points: [...currentPointsRef.current, point], color: 'red' }]);
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
      setIsDrawingBrush(false);
      setCurrentPoints([]);
    }

    if (activeTouchPointersRef.current.size === 0) {
      gestureModeRef.current = activeTool === 'none' ? 'controls' : 'none';
    }
  };

  if (loading) {
    return <div className="flex h-[100dvh] items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  if (!project) {
    return <div className="flex h-[100dvh] items-center justify-center bg-gray-900 text-red-500">Project not found</div>;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-gray-900 font-sans text-white" style={{ overscrollBehavior: 'none' }}>
      <div
        ref={viewportRef}
        className="relative flex-1 items-center justify-center"
        style={{ touchAction: 'none', overscrollBehavior: 'none', WebkitOverflowScrolling: 'auto' }}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerUpCapture}
        onPointerCancelCapture={handlePointerCancelCapture}
      >
        <Canvas className="h-full w-full" gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => gl.setClearColor('#ffffff')} style={{ touchAction: 'none' }}>
          <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
          <CameraTracker cameraRef={cameraRef} />
          <ArcballControls
            ref={controlsRef}
            enabled
            enablePan={false}
            enableRotate
            enableZoom
            enableAnimations={false}
            cursorZoom
          />
          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 50, 50]} intensity={1.5} />
          <directionalLight position={[-50, -50, -50]} intensity={0.5} />

          <Suspense fallback={null}>
            {stlModels.map((model, index) => (
              <STLMesh key={model.id} model={model} index={index} transparentGroupRefs={transparentGroupRefs} />
            ))}
          </Suspense>

          <TransparencySorter transparentGroupRefs={transparentGroupRefs} cameraRef={cameraRef} />
          <CameraParamsUpdater cameraRef={cameraRef} onUpdate={handleCameraUpdate} />
        </Canvas>

        <div className="absolute left-1/2 top-4 z-20 flex max-w-2xl -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-gray-600 bg-gray-800/90 px-4 py-2 text-white shadow-xl sm:rounded-full sm:px-6" data-ui-control="true">
          <span className="text-xs text-gray-400 sm:text-sm">Patient:</span>
          <span className="text-sm font-bold text-blue-400">{project.patient_name}</span>
          <div className="hidden h-4 w-px bg-gray-600 sm:block" />
          <span className="text-xs text-gray-400 sm:text-sm">Doctor:</span>
          <span className="text-sm font-bold text-white">{project.doctor_display_name}</span>
        </div>

        <button
          onClick={() => setShowModelSettings((previous) => !previous)}
          className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 p-2 text-xl text-white shadow-lg hover:bg-gray-700"
          title="Model settings"
        >
          ⚙️
        </button>

        {showModelSettings && (
          <div ref={settingsPanelRef} className="absolute right-4 top-20 z-30 max-h-[80vh] w-80 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-2xl" data-ui-control="true">
            <h3 className="mb-3 border-b border-gray-600 pb-2 text-lg font-bold">Models</h3>
            <div className="space-y-4">
              {stlModels.map((model) => (
                <div key={model.id} className="rounded-lg bg-gray-700 p-3">
                  <div className="mb-2 truncate text-sm font-semibold text-blue-300" title={model.name}>
                    {model.name}
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
                      className="flex-1 accent-blue-500"
                    />
                    <span className="w-8 text-xs text-gray-300">{Math.round(model.opacity * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 px-3" data-ui-control="true">
          <div className="inline-flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-gray-700 bg-gray-800 px-2 py-2 shadow-2xl">
            {tools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id === activeTool ? 'none' : (tool.id as ToolType));
                  setCurrentPoints([]);
                  setIsDrawingBrush(false);
                  activePointerIdRef.current = null;
                  gestureModeRef.current = 'none';
                }}
                className={[
                  'group relative flex h-10 w-10 items-center justify-center rounded-xl text-lg transition-all sm:h-12 sm:w-12 sm:text-xl',
                  activeTool === tool.id ? 'scale-110 bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-gray-700 text-gray-300 hover:scale-105 hover:bg-gray-600',
                ].join(' ')}
              >
                {tool.icon}
                <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  {tool.label}
                </span>
              </button>
            ))}

            <div className="mx-1 h-8 w-px bg-gray-600 sm:mx-2" />

            <button onClick={handleUndoDraw} className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/50 text-red-400 transition hover:bg-red-800/50 sm:h-12 sm:w-12" title="Undo">
              ↶
            </button>

            <button onClick={handleClearAll} className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-900/50 text-red-400 transition hover:bg-red-800/50 sm:h-12 sm:w-12" title="Clear">
              ✕
            </button>

            <button onClick={handleFinish} className="h-10 rounded-xl bg-green-600 px-3 text-[10px] font-bold text-white hover:bg-green-500 sm:h-12 sm:px-4 sm:text-xs">
              Save
            </button>
          </div>
        </div>

        {activeTool !== 'none' && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-20 w-[90%] -translate-x-1/2 animate-pulse rounded border border-blue-500/50 bg-blue-600/20 px-4 py-1 text-center text-[10px] font-bold text-blue-200 sm:top-24 sm:w-auto sm:text-xs">
            {activeTool === 'text' && currentPoints.length === 0 && 'Tap point 1 for the note anchor'}
            {activeTool === 'text' && currentPoints.length === 1 && 'Tap point 2 for the text label'}
            {activeTool !== 'text' && `Tool: ${tools.find((tool) => tool.id === activeTool)?.label}`}
          </div>
        )}

        <svg ref={svgRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full" style={{ touchAction: 'none' }}>
          {drawings.map((drawing, index) => {
            if (drawing.type === 'ruler') {
              return (
                <g key={index}>
                  <line x1={drawing.points[0].x} y1={drawing.points[0].y} x2={drawing.points[1].x} y2={drawing.points[1].y} stroke="#3b82f6" strokeWidth="2" />
                  <text x={drawing.points[1].x + 10} y={drawing.points[1].y} fill="#3b82f6" fontSize="16" fontWeight="bold">
                    {drawing.value} mm
                  </text>
                </g>
              );
            }

            if (drawing.type === 'circle') {
              if (drawing.points.length < 3) return null;

              const [point1, point2, point3] = drawing.points;
              const determinant = 2 * (point1.x * (point2.y - point3.y) + point2.x * (point3.y - point1.y) + point3.x * (point1.y - point2.y));
              if (Math.abs(determinant) < 1e-10) return null;

              const point1Squared = point1.x * point1.x + point1.y * point1.y;
              const point2Squared = point2.x * point2.x + point2.y * point2.y;
              const point3Squared = point3.x * point3.x + point3.y * point3.y;
              const centerX =
                (point1Squared * (point2.y - point3.y) + point2Squared * (point3.y - point1.y) + point3Squared * (point1.y - point2.y)) / determinant;
              const centerY =
                (point1Squared * (point3.x - point2.x) + point2Squared * (point1.x - point3.x) + point3Squared * (point2.x - point1.x)) / determinant;
              const radius = Math.hypot(point1.x - centerX, point1.y - centerY);

              return (
                <g key={index}>
                  <circle cx={centerX} cy={centerY} r={radius} stroke="#ef4444" strokeWidth="2" fill="none" />
                  <text x={centerX} y={centerY} fill="#ef4444" fontSize="16" fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                    Ø {drawing.value}
                  </text>
                </g>
              );
            }

            if (drawing.type === 'brush') {
              return <path key={index} d={`M ${drawing.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`} stroke="red" strokeWidth="2" fill="none" />;
            }

            if (drawing.type === 'angle') {
              return (
                <g key={index}>
                  <line x1={drawing.points[0].x} y1={drawing.points[0].y} x2={drawing.points[1].x} y2={drawing.points[1].y} stroke="yellow" strokeWidth="2" />
                  <line x1={drawing.points[1].x} y1={drawing.points[1].y} x2={drawing.points[2].x} y2={drawing.points[2].y} stroke="yellow" strokeWidth="2" />
                  <text x={drawing.points[1].x + 10} y={drawing.points[1].y - 10} fill="yellow" fontSize="16">
                    {drawing.value}°
                  </text>
                </g>
              );
            }

            if (drawing.type === 'text') {
              const note = textNotes.find((item) => item.id === drawing.textId);
              const displayText = note ? String(drawing.textId) : '?';

              return (
                <g key={index}>
                  <line x1={drawing.target.x} y1={drawing.target.y} x2={drawing.labelPos.x} y2={drawing.labelPos.y} stroke={drawing.color} strokeWidth="1.5" strokeDasharray="4 2" />
                  <circle cx={drawing.target.x} cy={drawing.target.y} r={3} fill={drawing.color} />
                  <text x={drawing.labelPos.x} y={drawing.labelPos.y} fill={drawing.color} fontSize={drawing.fontSize} fontFamily="Arial, sans-serif" fontWeight="bold" alignmentBaseline="middle" textAnchor="start">
                    {displayText}
                  </text>
                </g>
              );
            }

            return null;
          })}

          {activeTool === 'ruler' && currentPoints.length === 1 && <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="blue" />}

          {activeTool === 'circle' && currentPoints.length > 0 && (
            <>
              {currentPoints.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={4} fill="red" stroke="white" strokeWidth="1" />
              ))}
              {currentPoints.length === 2 && (
                <line x1={currentPoints[0].x} y1={currentPoints[0].y} x2={currentPoints[1].x} y2={currentPoints[1].y} stroke="red" strokeWidth="1" strokeDasharray="4 4" />
              )}
            </>
          )}

          {activeTool === 'angle' && currentPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={3} fill="yellow" />)}

          {activeTool === 'brush' && currentPoints.length > 0 && (
            <path d={`M ${currentPoints.map((point) => `${point.x} ${point.y}`).join(' L ')}`} stroke="red" strokeWidth="2" fill="none" />
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
