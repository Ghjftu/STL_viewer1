import React, { useEffect, useState, useRef, Suspense, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

// --- КОМПОНЕНТ ДЛЯ ОТСЛЕЖИВАНИЯ КАМЕРЫ ---
const CameraTracker = ({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null> }) => {
    const { camera } = useThree();
    useEffect(() => {
        cameraRef.current = camera as THREE.OrthographicCamera;
    }, [camera, cameraRef]);
    return null;
};

// --- КОМПОНЕНТ ЗАГРУЗКИ И ОТРИСОВКИ STL-МОДЕЛИ С ПОДДЕРЖКОЙ ПРОЗРАЧНОСТИ ---
const STLMesh = React.forwardRef<
    THREE.Group,
    { model: any; transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>; index: number }
>(({ model, transparentGroupRefs, index }, ref) => {
    const loaded = useLoader(STLLoader, model.url);
    const geometries = Array.isArray(loaded) ? loaded : [loaded];

    const rot = model.rotation || [0, 0, 0];
    const rotationInRadians: [number, number, number] = [
        THREE.MathUtils.degToRad(rot[0]),
        THREE.MathUtils.degToRad(rot[1]),
        THREE.MathUtils.degToRad(rot[2]),
    ];

    if (model.opacity >= 0.99) {
        return (
            <group
                position={model.position}
                rotation={rotationInRadians}
                visible={model.visible}
                userData={{ transparent: false }}
            >
                {geometries.map((geom, idx) => (
                    <mesh key={idx} geometry={geom}>
                        <meshStandardMaterial color={model.color} transparent={false} side={THREE.DoubleSide} />
                    </mesh>
                ))}
            </group>
        );
    }

    return (
        <group
            position={model.position}
            rotation={rotationInRadians}
            visible={model.visible}
            ref={(el) => {
                transparentGroupRefs.current[index] = el;
                if (typeof ref === 'function') ref(el);
                else if (ref) ref.current = el;
            }}
            userData={{ transparent: true }}
        >
            {geometries.map((geom, idx) => (
                <React.Fragment key={idx}>
                    <mesh geometry={geom} renderOrder={1}>
                        <meshStandardMaterial
                            color={model.color}
                            transparent={true}
                            opacity={model.opacity}
                            side={THREE.BackSide}
                            depthWrite={true}
                            depthTest={true}
                        />
                    </mesh>
                    <mesh geometry={geom} renderOrder={2}>
                        <meshStandardMaterial
                            color={model.color}
                            transparent={true}
                            opacity={model.opacity}
                            side={THREE.FrontSide}
                            depthWrite={false}
                            depthTest={true}
                        />
                    </mesh>
                </React.Fragment>
            ))}
        </group>
    );
});

// --- КОМПОНЕНТ ДЛЯ СОРТИРОВКИ ПОРЯДКА ОТРИСОВКИ ПРОЗР. ОБЪЕКТОВ ---
const TransparencySorter = ({
    transparentGroupRefs,
    cameraRef,
}: {
    transparentGroupRefs: React.MutableRefObject<(THREE.Group | null)[]>;
    cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
}) => {
    useFrame(() => {
        if (!cameraRef.current) return;

        const groups = transparentGroupRefs.current.filter((g): g is THREE.Group => g !== null);
        if (groups.length === 0) return;

        const cameraPos = cameraRef.current.position;

        groups.sort((a, b) => {
            const distA = cameraPos.distanceTo(a.position);
            const distB = cameraPos.distanceTo(b.position);
            return distB - distA;
        });

        groups.forEach((group, idx) => {
            group.renderOrder = 100 + idx;
        });
    });

    return null;
};

// --- ТИПЫ ДЛЯ ИНСТРУМЕНТОВ И РИСОВАНИЯ ---
type ToolType = 'none' | 'ruler' | 'angle' | 'circle' | 'brush' | 'text';
type Point = { x: number; y: number };
type Drawing =
    | { type: 'ruler'; points: Point[]; value: number }
    | { type: 'angle'; points: Point[]; value: number }
    | { type: 'circle'; points: Point[]; value: number }
    | { type: 'brush'; points: Point[]; color: string }
    | { type: 'text'; target: Point; labelPos: Point; text: string; color: string; fontSize: number };

// --- ПАРАМЕТРЫ КАМЕРЫ (используются в линейках) ---
interface CameraParams {
    left: number;
    right: number;
    top: number;
    bottom: number;
    zoom: number;
    position: THREE.Vector3;
}

// --- КОМПОНЕНТ: ОБНОВЛЕНИЕ cameraParams ЧЕРЕЗ useFrame ---
const CameraParamsUpdater: React.FC<{
    cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>;
    onUpdate: (params: CameraParams) => void;
}> = ({ cameraRef, onUpdate }) => {
    const lastRef = useRef<string>('');

    useFrame(() => {
        if (!cameraRef.current) return;
        const cam = cameraRef.current;

        // Развёртываем NDC-углы в мировые координаты
        const ndcTopLeft = new THREE.Vector3(-1, 1, 0.5);
        const ndcBottomRight = new THREE.Vector3(1, -1, 0.5);
        const worldTopLeft = ndcTopLeft.clone().unproject(cam);
        const worldBottomRight = ndcBottomRight.clone().unproject(cam);

        // Проверяем, изменились ли параметры (чтобы не спамить setState)
        const key = `${worldTopLeft.x.toFixed(4)},${worldTopLeft.y.toFixed(4)},${worldBottomRight.x.toFixed(4)},${worldBottomRight.y.toFixed(4)},${cam.zoom.toFixed(4)}`;
        if (key === lastRef.current) return;
        lastRef.current = key;

        onUpdate({
            left: worldTopLeft.x,
            right: worldBottomRight.x,
            top: worldTopLeft.y,
            bottom: worldBottomRight.y,
            zoom: cam.zoom,
            position: cam.position.clone(),
        });
    });

    return null;
};

// --- КОМПОНЕНТ ЛИНЕЕК (рулетки по бокам) ---
const Rulers: React.FC<{
    cameraParams: CameraParams | null;
    viewportRef: React.RefObject<HTMLDivElement | null>;
}> = ({ cameraParams, viewportRef }) => {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!viewportRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height,
                });
            }
        });
        observer.observe(viewportRef.current);
        return () => observer.disconnect();
    }, [viewportRef]);

    if (!cameraParams || size.width === 0 || size.height === 0) return null;

    const { left, right, top, bottom } = cameraParams;
    const worldWidth = right - left;
    const worldHeight = top - bottom;

    // Вычислить шаг для делений (мм)
    const getStep = (worldSpan: number, pxSpan: number, minPxPerMajor = 80): number => {
        const roughStep = worldSpan / (pxSpan / minPxPerMajor);
        if (roughStep <= 0 || !isFinite(roughStep)) return 10;
        const exponent = Math.floor(Math.log10(roughStep));
        const base = Math.pow(10, exponent);
        const normalized = roughStep / base;
        let step: number;
        if (normalized < 1.5) step = base;
        else if (normalized < 3.5) step = 2 * base;
        else if (normalized < 7.5) step = 5 * base;
        else step = 10 * base;
        return step;
    };

    const stepX = getStep(worldWidth, size.width);
    const stepY = getStep(worldHeight, size.height);

    // Генерация тиков
    const startX = Math.floor(left / stepX) * stepX;
    const endX = Math.ceil(right / stepX) * stepX;
    const startY = Math.floor(bottom / stepY) * stepY;
    const endY = Math.ceil(top / stepY) * stepY;

    const RULER_THICKNESS = 28;

    const ticksX: { value: number; x: number }[] = [];
    for (let v = startX; v <= endX; v += stepX) {
        const x = ((v - left) / worldWidth) * size.width;
        if (x >= RULER_THICKNESS && x <= size.width) {
            ticksX.push({ value: v, x });
        }
    }

    const ticksY: { value: number; y: number }[] = [];
    for (let v = startY; v <= endY; v += stepY) {
        const y = size.height - ((v - bottom) / worldHeight) * size.height;
        if (y >= 0 && y <= size.height - RULER_THICKNESS) {
            ticksY.push({ value: v, y });
        }
    }

    // Форматирование значений
    const formatValue = (v: number): string => {
        const abs = Math.abs(v);
        if (abs >= 100) return v.toFixed(0);
        if (abs >= 10) return v.toFixed(1);
        if (abs >= 1) return v.toFixed(1);
        return v.toFixed(2);
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 15,
                overflow: 'hidden',
            }}
        >
            {/* Горизонтальная линейка (внизу) */}
            <svg
                width="100%"
                height={RULER_THICKNESS}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    overflow: 'hidden',
                }}
            >
                {/* Фон линейки */}
                <rect x="0" y="0" width="100%" height={RULER_THICKNESS} fill="rgba(30,30,30,0.85)" />
                {/* Верхняя граница */}
                <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

                {ticksX.map((tick, i) => {
                    // Мелкие деления (половинки)
                    const halfStep = stepX / 2;
                    const halfX = ((tick.value - halfStep - left) / worldWidth) * size.width;

                    return (
                        <g key={`h-${i}`}>
                            {/* Мелкое деление */}
                            {halfX >= RULER_THICKNESS && halfX <= size.width && (
                                <line
                                    x1={halfX}
                                    y1="0"
                                    x2={halfX}
                                    y2="5"
                                    stroke="rgba(255,255,255,0.3)"
                                    strokeWidth="1"
                                />
                            )}
                            {/* Основное деление */}
                            <line
                                x1={tick.x}
                                y1="0"
                                x2={tick.x}
                                y2="10"
                                stroke="rgba(255,255,255,0.7)"
                                strokeWidth="1"
                            />
                            <text
                                x={tick.x}
                                y="22"
                                fill="rgba(255,255,255,0.8)"
                                fontSize="9"
                                textAnchor="middle"
                                fontFamily="monospace"
                            >
                                {formatValue(tick.value)}
                            </text>
                        </g>
                    );
                })}

                {/* Подпись единиц */}
                <text
                    x={size.width - 4}
                    y="22"
                    fill="rgba(100,180,255,0.7)"
                    fontSize="8"
                    textAnchor="end"
                    fontFamily="monospace"
                >
                    мм
                </text>
            </svg>

            {/* Вертикальная линейка (слева) */}
            <svg
                width={RULER_THICKNESS}
                height="100%"
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    overflow: 'hidden',
                }}
            >
                {/* Фон линейки */}
                <rect x="0" y="0" width={RULER_THICKNESS} height="100%" fill="rgba(30,30,30,0.85)" />
                {/* Правая граница */}
                <line x1={RULER_THICKNESS} y1="0" x2={RULER_THICKNESS} y2="100%" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

                {ticksY.map((tick, i) => {
                    const halfStep = stepY / 2;
                    const halfY = size.height - ((tick.value + halfStep - bottom) / worldHeight) * size.height;

                    return (
                        <g key={`v-${i}`}>
                            {halfY >= 0 && halfY <= size.height - RULER_THICKNESS && (
                                <line
                                    x1={RULER_THICKNESS - 5}
                                    y1={halfY}
                                    x2={RULER_THICKNESS}
                                    y2={halfY}
                                    stroke="rgba(255,255,255,0.3)"
                                    strokeWidth="1"
                                />
                            )}
                            <line
                                x1={RULER_THICKNESS - 10}
                                y1={tick.y}
                                x2={RULER_THICKNESS}
                                y2={tick.y}
                                stroke="rgba(255,255,255,0.7)"
                                strokeWidth="1"
                            />
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

                {/* Подпись единиц */}
                <text
                    x="4"
                    y="14"
                    fill="rgba(100,180,255,0.7)"
                    fontSize="8"
                    textAnchor="start"
                    fontFamily="monospace"
                >
                    мм
                </text>
            </svg>

            {/* Угловой квадрат (перекрытие линеек в углу) */}
            <svg
                width={RULER_THICKNESS}
                height={RULER_THICKNESS}
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    overflow: 'hidden',
                }}
            >
                <rect x="0" y="0" width={RULER_THICKNESS} height={RULER_THICKNESS} fill="rgba(30,30,30,0.95)" />
                <line x1={RULER_THICKNESS} y1="0" x2={RULER_THICKNESS} y2={RULER_THICKNESS} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <line x1="0" y1="0" x2={RULER_THICKNESS} y2="0" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            </svg>
        </div>
    );
};

// --- ГЛАВНЫЙ КОМПОНЕНТ ---
export const Viewer3D: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const isAdmin = new URLSearchParams(location.search).get('mode') === 'admin';

    const [project, setProject] = useState<any>(null);
    const [stlModels, setStlModels] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [activeTool, setActiveTool] = useState<ToolType>('none');
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
    const [isDrawingBrush, setIsDrawingBrush] = useState(false);

    // Параметры камеры для линеек
    const [cameraParams, setCameraParams] = useState<CameraParams | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const controlsRef = useRef<any>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null); // Реф на 3D-viewport, а не на весь контейнер
    const containerRef = useRef<HTMLDivElement>(null);
    const transparentGroupRefs = useRef<(THREE.Group | null)[]>([]);

    // Для предотвращения дубликата клика от touch + click
    const lastTouchEndTimeRef = useRef<number>(0);

    // --- ПРОВЕРКА АВТОРИЗАЦИИ ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            console.log("Нет токена авторизации. Переход на вход...");
            const currentPath = location.pathname + location.search;
            localStorage.setItem('returnUrl', currentPath);
            navigate('/', { replace: true });
        }
    }, [navigate, location]);

    // --- ЗАГРУЗКА ДАННЫХ ПРОЕКТА ---
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        setLoading(true);

        fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}`, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
        })
            .then((res) => {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('token');
                    const currentPath = location.pathname + location.search;
                    localStorage.setItem('returnUrl', currentPath);
                    navigate('/', { replace: true });
                    throw new Error('Unauthorized');
                }
                return res.json();
            })
            .then((data) => {
                if (data.project) {
                    setProject(data.project);

                    let savedState: any[] = [];
                    if (data.project.scene_state) {
                        savedState =
                            typeof data.project.scene_state === 'string'
                                ? JSON.parse(data.project.scene_state)
                                : data.project.scene_state;
                    }

                    const mergedModels = (data.stlFiles || []).map((file: any) => {
                        const savedSetting = savedState.find((s: any) => s.id === file.id);
                        return savedSetting
                            ? { ...file, ...savedSetting }
                            : {
                                    ...file,
                                    visible: true,
                                    opacity: 1,
                                    color: '#cccccc',
                                    position: [0, 0, 0],
                                    rotation: [0, 0, 0],
                                };
                    });
                    setStlModels(mergedModels);
                    transparentGroupRefs.current = new Array(mergedModels.length).fill(null);
                }
            })
            .catch((err) => console.error('Ошибка загрузки:', err))
            .finally(() => setLoading(false));
    }, [id, navigate, location]);

    // --- ЦЕНТРИРОВАНИЕ КАМЕРЫ НА МОДЕЛИ ---
    useEffect(() => {
        if (stlModels.length === 0 || !controlsRef.current) return;

        const centerCameraOnModels = async () => {
            const loader = new STLLoader();
            const geometries: THREE.BufferGeometry[] = [];

            await Promise.all(
                stlModels.map(async (model) => {
                    try {
                        const geom = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
                            loader.load(model.url, resolve, undefined, reject);
                        });
                        geometries.push(geom);
                    } catch (err) {
                        console.warn(`Не удалось загрузить геометрию для ${model.name}`, err);
                    }
                })
            );

            if (geometries.length === 0) return;

            const bbox = new THREE.Box3();
            geometries.forEach((geom) => {
                geom.computeBoundingBox();
                if (geom.boundingBox) {
                    bbox.expandByPoint(geom.boundingBox.min);
                    bbox.expandByPoint(geom.boundingBox.max);
                }
            });

            const center = bbox.getCenter(new THREE.Vector3());
            const size = bbox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);

            controlsRef.current.target.copy(center);

            if (cameraRef.current) {
                const fitScale = 1.2;
                const zoom = (cameraRef.current.top - cameraRef.current.bottom) / (maxDim * fitScale);
                cameraRef.current.zoom = zoom;
                cameraRef.current.updateProjectionMatrix();
            }

            controlsRef.current.update();
        };

        centerCameraOnModels();
    }, [stlModels]);

    // --- ОБНОВЛЕНИЕ OrbitControls ПРИ СМЕНЕ activeTool ---
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.enabled = activeTool === 'none';
        }
    }, [activeTool]);

    // --- Callback для обновления параметров камеры (из CameraParamsUpdater) ---
    const handleCameraUpdate = useCallback((params: CameraParams) => {
        setCameraParams(params);
    }, []);

    // --- ПРОЕКЦИЯ 3D-точки экранных координат ---
    const unprojectPoint = (p: Point): THREE.Vector3 => {
        if (!cameraRef.current || !svgRef.current) return new THREE.Vector3();
        const rect = svgRef.current.getBoundingClientRect();

        const ndcX = (p.x / rect.width) * 2 - 1;
        const ndcY = -(p.y / rect.height) * 2 + 1;

        const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
        vector.unproject(cameraRef.current);
        return vector;
    };

    const calculateDistance = (p1: Point, p2: Point) => {
        const v1 = unprojectPoint(p1);
        const v2 = unprojectPoint(p2);
        return v1.distanceTo(v2);
    };

    const calculateAngle = (p1: Point, p2: Point, p3: Point) => {
        const v1 = unprojectPoint(p1);
        const v2 = unprojectPoint(p2);
        const v3 = unprojectPoint(p3);

        const vec1 = v1.clone().sub(v2);
        const vec2 = v3.clone().sub(v2);

        const angleRad = vec1.angleTo(vec2);
        return THREE.MathUtils.radToDeg(angleRad);
    };

    const calculateCircleDiameter = (p1: Point, p2: Point, p3: Point): number => {
        const v1 = unprojectPoint(p1);
        const v2 = unprojectPoint(p2);
        const v3 = unprojectPoint(p3);

        const a = v2.distanceTo(v3);
        const b = v1.distanceTo(v3);
        const c = v1.distanceTo(v2);

        const semiperimeter = (a + b + c) / 2;
        const area = Math.sqrt(semiperimeter * (semiperimeter - a) * (semiperimeter - b) * (semiperimeter - c));

        if (area < 1e-6) return 0;

        const R = (a * b * c) / (4 * area);
        return 2 * R;
    };

    // --- ОБРАБОТКА КЛИКА/ТАПА для инструментов ---
    const handleToolClick = useCallback((clientX: number, clientY: number) => {
        if (activeTool === 'none' || activeTool === 'brush') return;

        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const newPoint = { x, y };

        if (activeTool === 'text') {
            if (currentPoints.length === 0) {
                setCurrentPoints([newPoint]);
            } else {
                const targetPoint = currentPoints[0];
                const labelPoint = newPoint;

                const userText = window.prompt('Введите комментарий:');
                if (userText && userText.trim() !== '') {
                    const newText: Drawing = {
                        type: 'text',
                        target: targetPoint,
                        labelPos: labelPoint,
                        text: userText,
                        color: '#ff0000',
                        fontSize: 16,
                    };
                    setDrawings(prev => [...prev, newText]);
                }
                setCurrentPoints([]);
            }
            return;
        }

        if (activeTool === 'ruler') {
            if (currentPoints.length === 0) {
                setCurrentPoints([newPoint]);
            } else {
                const dist = calculateDistance(currentPoints[0], newPoint);
                setDrawings(prev => [...prev, { type: 'ruler', points: [currentPoints[0], newPoint], value: parseFloat(dist.toFixed(1)) }]);
                setCurrentPoints([]);
            }
        } else if (activeTool === 'circle') {
            const newPoints = [...currentPoints, newPoint];
            setCurrentPoints(newPoints);

            if (newPoints.length === 3) {
                const diameter = calculateCircleDiameter(newPoints[0], newPoints[1], newPoints[2]);
                if (diameter > 0) {
                    setDrawings(prev => [...prev, { type: 'circle', points: newPoints, value: parseFloat(diameter.toFixed(1)) }]);
                } else {
                    console.warn('Точки коллинеарны, окружность не построить');
                }
                setCurrentPoints([]);
            }
        } else if (activeTool === 'angle') {
            const pts = [...currentPoints, newPoint];
            if (pts.length < 3) {
                setCurrentPoints(pts);
            } else {
                const deg = calculateAngle(pts[0], pts[1], pts[2]);
                setDrawings(prev => [...prev, { type: 'angle', points: pts, value: parseFloat(deg.toFixed(1)) }]);
                setCurrentPoints([]);
            }
        }
    }, [activeTool, currentPoints]);

    // --- ОБРАБОТЧИКИ МЫШИ ---
    const handleSvgClick = (e: React.MouseEvent) => {
        // Игнорируем "клик" если только что был touchend (предотвращаем двойной вызов)
        if (Date.now() - lastTouchEndTimeRef.current < 300) return;
        handleToolClick(e.clientX, e.clientY);
    };

    // --- ОБРАБОТЧИКИ ТАЧА (для всех инструментов, включая click-based) ---
    const handleTouchStart = (e: React.TouchEvent) => {
        if (activeTool === 'none') return;
        e.preventDefault(); // Блокируем скролл страницы

        if (activeTool === 'brush') {
            setIsDrawingBrush(true);
            const touch = e.touches[0];
            const rect = svgRef.current?.getBoundingClientRect();
            if (rect) setCurrentPoints([{ x: touch.clientX - rect.left, y: touch.clientY - rect.top }]);
        }
        // Для остальных инструментов — клик обрабатывается в touchEnd
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (activeTool === 'none') return;
        e.preventDefault(); // Блокируем скролл страницы

        if (activeTool === 'brush' && isDrawingBrush) {
            const touch = e.touches[0];
            const rect = svgRef.current?.getBoundingClientRect();
            if (rect) {
                setCurrentPoints((prev) => [...prev, { x: touch.clientX - rect.left, y: touch.clientY - rect.top }]);
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (activeTool === 'none') return;
        e.preventDefault(); // Блокируем скролл

        if (activeTool === 'brush') {
            if (isDrawingBrush) {
                setIsDrawingBrush(false);
                setDrawings(prev => [...prev, { type: 'brush', points: currentPoints, color: 'red' }]);
                setCurrentPoints([]);
            }
        } else {
            // Для click-based инструментов: получаем координаты из changedTouches
            const touch = e.changedTouches[0];
            if (touch) {
                lastTouchEndTimeRef.current = Date.now();
                handleToolClick(touch.clientX, touch.clientY);
            }
        }
    };

    // --- ОБРАБОТЧИКИ МЫШИ для brush ---
    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool !== 'brush') return;
        setIsDrawingBrush(true);
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) setCurrentPoints([{ x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawingBrush || activeTool !== 'brush') return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) setCurrentPoints((prev) => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    };

    const handleMouseUp = (_e: React.MouseEvent) => {
        if (activeTool === 'brush' && isDrawingBrush) {
            setIsDrawingBrush(false);
            setDrawings(prev => [...prev, { type: 'brush', points: currentPoints, color: 'red' }]);
            setCurrentPoints([]);
        }
    };

    const handleUndoDraw = () => {
        if (currentPoints.length > 0) {
            setCurrentPoints([]);
        } else {
            setDrawings((prev) => prev.slice(0, -1));
        }
    };

    const handleClearAll = () => {
        if (window.confirm('Очистить все разметки?')) {
            setDrawings([]);
            setCurrentPoints([]);
        }
    };

    const handleFinish = async () => {
        if (drawings.length === 0) {
            alert('Эскиз пуст. Добавьте измерения или рисунки перед отправкой.');
            return;
        }

        if (!window.confirm('Отправить эскиз в лабораторию?')) return;

        const cameraState = cameraRef.current ? {
            position: cameraRef.current.position.toArray(),
            rotation: cameraRef.current.rotation.toArray(),
            zoom: cameraRef.current.zoom
        } : {};

        const svgContent = svgRef.current ? svgRef.current.outerHTML : null;

        const payload = {
            cameraState,
            canvasData: drawings,
            svgContent
        };

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}/sketch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                alert('Эскиз отправлен в лабораторию!');
                setActiveTool('none');
                setDrawings([]);
                setCurrentPoints([]);
                setIsDrawingBrush(false);
            } else {
                const err = await response.json();
                alert(`Ошибка: ${err.message}`);
            }
        } catch (error) {
            console.error(error);
            alert('Ошибка соединения с сервером');
        }
    };

    // --- УТИЛИТЫ ДЛЯ АДМИНА ---
    const updateModel = (modelId: string, field: string, value: any) => {
        setStlModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, [field]: value } : m)));
    };

    const updateVector = (modelId: string, field: 'position' | 'rotation', index: number, value: string) => {
        setStlModels((prev) =>
            prev.map((m) => {
                if (m.id === modelId) {
                    const newArr = [...(m[field] || [0, 0, 0])];
                    newArr[index] = Number(value) || 0;
                    return { ...m, [field]: newArr };
                }
                return m;
            })
        );
    };

    const saveScene = async () => {
        const token = localStorage.getItem('token');
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}/scene`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ sceneState: stlModels }),
            });
            if (response.ok) {
                alert('Сцена сохранена!');
            } else {
                alert('Ошибка сохранения');
            }
        } catch (error) {
            console.error(error);
            alert('Ошибка сети');
        }
    };

    if (loading) return <div className="h-[100dvh] bg-gray-900 text-white flex items-center justify-center">Загрузка...</div>;
    if (!project) return <div className="h-[100dvh] bg-gray-900 text-red-500 flex items-center justify-center">Проект не найден</div>;

    const tools = [
        { id: 'ruler', icon: '📏', label: 'Линейка' },
        { id: 'angle', icon: '📐', label: 'Угол' },
        { id: 'circle', icon: '⭕', label: 'Диаметр' },
        { id: 'brush', icon: '✏️', label: 'Кисть' },
        { id: 'text', icon: '💬', label: 'Текст' },
    ];

    const axisColorMap: Record<string, string> = {
        X: 'text-red-500',
        Y: 'text-green-500',
        Z: 'text-blue-500'
    };

    return (
        <div ref={containerRef} className="flex h-[100dvh] bg-gray-900 text-white overflow-hidden font-sans">
            {/* 3D-сцена */}
            <div ref={viewportRef} className="flex-1 relative flex items-center justify-center">
                <Canvas
                    className="w-full h-full"
                    gl={{ antialias: true, alpha: false }}
                    onCreated={({ gl }) => {
                        gl.setClearColor('#111111');
                    }}
                    // Предотвращаем скролл при тач-событиях на Canvas
                    style={{ touchAction: activeTool !== 'none' ? 'none' : 'auto' }}
                >
                    <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
                    <CameraTracker cameraRef={cameraRef} />
                    <OrbitControls
                        ref={controlsRef}
                        enabled={activeTool === 'none'}
                        enableRotate={isAdmin ? true : activeTool === 'none'}
                        enablePan={true}
                        enableZoom={true}
                    />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[50, 50, 50]} intensity={1.5} />
                    <directionalLight position={[-50, -50, -50]} intensity={0.5} />
                    <axesHelper args={[100]} />
                    <Suspense fallback={null}>
                        {stlModels.map((model, idx) => (
                            <STLMesh
                                key={model.id}
                                model={model}
                                index={idx}
                                transparentGroupRefs={transparentGroupRefs}
                            />
                        ))}
                    </Suspense>
                    {!isAdmin && <TransparencySorter transparentGroupRefs={transparentGroupRefs} cameraRef={cameraRef} />}

                    {/* Обновление параметров камеры через useFrame — работает надёжно */}
                    <CameraParamsUpdater cameraRef={cameraRef} onUpdate={handleCameraUpdate} />
                </Canvas>

                {/* Интерфейс для врача */}
                {!isAdmin && (
                    <>
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[95%] sm:w-auto max-w-2xl bg-gray-800/90 text-white px-4 sm:px-6 py-2 rounded-2xl sm:rounded-full shadow-xl border border-gray-600 flex flex-wrap justify-center items-center gap-2 sm:gap-4 z-20">
                            <span className="text-xs sm:text-sm text-gray-400">Пациент:</span>
                            <span className="font-bold text-blue-400 text-sm">{project?.patient_name}</span>
                            <div className="hidden sm:block h-4 w-[1px] bg-gray-600"></div>
                            <span className="text-xs sm:text-sm text-gray-400">Врач:</span>
                            <span className="font-bold text-white text-sm">{project?.doctor_display_name}</span>
                        </div>

                        {/* Панель инструментов */}
                        <div className="absolute bottom-6 left-4 right-4 sm:left-1/2 sm:transform sm:-translate-x-1/2 sm:w-auto bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-2 flex flex-wrap justify-center items-center gap-2 z-20">
                            {tools.map((tool) => (
                                <button
                                    key={tool.id}
                                    onClick={() => {
                                        setActiveTool(tool.id === activeTool ? 'none' : (tool.id as ToolType));
                                        setCurrentPoints([]);
                                    }}
                                    className={`
                                        relative group w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-lg sm:text-xl transition-all
                                        ${
                                            activeTool === tool.id
                                                ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] scale-110'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-105'
                                        }
                                    `}
                                >
                                    {tool.icon}
                                    <span className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">
                                        {tool.label}
                                    </span>
                                </button>
                            ))}

                            <div className="w-[1px] h-8 bg-gray-600 mx-1 sm:mx-2"></div>

                            <button
                                onClick={handleUndoDraw}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-900/50 text-red-400 hover:bg-red-800/50 flex items-center justify-center transition"
                                title="Отменить последнее действие"
                            >
                                ↩️
                            </button>

                            <button
                                onClick={handleClearAll}
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-900/50 text-red-400 hover:bg-red-800/50 flex items-center justify-center transition"
                                title="Очистить все"
                            >
                                🗑️
                            </button>

                            <button
                                onClick={handleFinish}
                                className="px-3 sm:px-4 py-2 sm:py-0 h-10 sm:h-12 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-[10px] sm:text-xs"
                            >
                                Готово
                            </button>
                        </div>

                        {activeTool !== 'none' && (
                            <div className="absolute top-20 sm:top-24 left-1/2 transform -translate-x-1/2 w-[90%] sm:w-auto text-center bg-blue-600/20 border border-blue-500/50 text-blue-200 px-4 py-1 rounded text-[10px] sm:text-xs font-bold pointer-events-none animate-pulse z-20">
                                {activeTool === 'text' && currentPoints.length === 0 && "Текст: Шаг 1 — нажмите точку на объекте"}
                                {activeTool === 'text' && currentPoints.length === 1 && "Текст: Шаг 2 — нажмите место для надписи"}
                                {activeTool !== 'text' && `Актив: ${tools.find((t) => t.id === activeTool)?.label.toUpperCase()} — кликните точки`}
                            </div>
                        )}
                    </>
                )}

                {/* SVG-слой для рисования */}
                {!isAdmin && (
                    <svg
                        ref={svgRef}
                        className={`absolute inset-0 w-full h-full z-10 ${activeTool !== 'none' ? 'cursor-crosshair' : 'pointer-events-none'}`}
                        style={{ touchAction: 'none' }} // Всегда блокируем тач-скролл на SVG
                        onClick={handleSvgClick}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {drawings.map((d, i) => {
                            if (d.type === 'ruler') {
                                return (
                                    <g key={i}>
                                        <line
                                            x1={d.points[0].x}
                                            y1={d.points[0].y}
                                            x2={d.points[1].x}
                                            y2={d.points[1].y}
                                            stroke="#3b82f6"
                                            strokeWidth="2"
                                        />
                                        <text x={d.points[1].x + 10} y={d.points[1].y} fill="#3b82f6" fontSize="16" fontWeight="bold">
                                            {d.value} mm
                                        </text>
                                    </g>
                                );
                            }
                            if (d.type === 'circle') {
                                if (d.points.length < 3) return null;

                                const [p1, p2, p3] = d.points;

                                const D = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));

                                if (Math.abs(D) < 1e-10) return null;

                                const x1y1 = p1.x * p1.x + p1.y * p1.y;
                                const x2y2 = p2.x * p2.x + p2.y * p2.y;
                                const x3y3 = p3.x * p3.x + p3.y * p3.y;

                                const cx = (x1y1 * (p2.y - p3.y) + x2y2 * (p3.y - p1.y) + x3y3 * (p1.y - p2.y)) / D;
                                const cy = (x1y1 * (p3.x - p2.x) + x2y2 * (p1.x - p3.x) + x3y3 * (p2.x - p1.x)) / D;
                                const r = Math.sqrt(Math.pow(p1.x - cx, 2) + Math.pow(p1.y - cy, 2));

                                return (
                                    <g key={i}>
                                        <circle
                                            cx={cx}
                                            cy={cy}
                                            r={r}
                                            stroke="#ef4444"
                                            strokeWidth="2"
                                            fill="none"
                                        />
                                        <text
                                            x={cx}
                                            y={cy}
                                            fill="#ef4444"
                                            fontSize="16"
                                            fontWeight="bold"
                                            textAnchor="middle"
                                            dominantBaseline="middle"
                                        >
                                            Ø {d.value}
                                        </text>
                                    </g>
                                );
                            }
                            if (d.type === 'brush') {
                                const pathData = `M ${d.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;
                                return <path key={i} d={pathData} stroke="red" strokeWidth="2" fill="none" />;
                            }
                            if (d.type === 'angle') {
                                return (
                                    <g key={i}>
                                        <line
                                            x1={d.points[0].x}
                                            y1={d.points[0].y}
                                            x2={d.points[1].x}
                                            y2={d.points[1].y}
                                            stroke="yellow"
                                            strokeWidth="2"
                                        />
                                        <line
                                            x1={d.points[1].x}
                                            y1={d.points[1].y}
                                            x2={d.points[2].x}
                                            y2={d.points[2].y}
                                            stroke="yellow"
                                            strokeWidth="2"
                                        />
                                        <text x={d.points[1].x + 10} y={d.points[1].y - 10} fill="yellow" fontSize="16">
                                            {d.value}°
                                        </text>
                                    </g>
                                );
                            }
                            if (d.type === 'text') {
                                return (
                                    <g key={i}>
                                        <line
                                            x1={d.target.x}
                                            y1={d.target.y}
                                            x2={d.labelPos.x}
                                            y2={d.labelPos.y}
                                            stroke={d.color}
                                            strokeWidth="1.5"
                                            strokeDasharray="4 2"
                                        />
                                        <circle cx={d.target.x} cy={d.target.y} r={3} fill={d.color} />
                                        <text
                                            x={d.labelPos.x}
                                            y={d.labelPos.y}
                                            fill={d.color}
                                            fontSize={d.fontSize}
                                            fontFamily="Arial, sans-serif"
                                            fontWeight="bold"
                                            alignmentBaseline="middle"
                                            textAnchor="start"
                                        >
                                            {d.text}
                                        </text>
                                    </g>
                                );
                            }
                            return null;
                        })}

                        {/* Текущие точки в процессе рисования */}
                        {activeTool === 'ruler' && currentPoints.length === 1 && (
                            <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="blue" />
                        )}
                        {activeTool === 'circle' && currentPoints.length > 0 && (
                            <>
                                {currentPoints.map((p, idx) => (
                                    <circle key={idx} cx={p.x} cy={p.y} r={4} fill="red" stroke="white" strokeWidth="1" />
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
                                
                            </>
                        )}
                        {activeTool === 'angle' &&
                            currentPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="yellow" />)}
                        {activeTool === 'brush' && currentPoints.length > 0 && (
                            <path
                                d={`M ${currentPoints.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
                                stroke="red"
                                strokeWidth="2"
                                fill="none"
                            />
                        )}
                        {activeTool === 'text' && currentPoints.length === 1 && (
                            <g>
                                <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="#ff0000" />
                                <text
                                    x={currentPoints[0].x + 10}
                                    y={currentPoints[0].y - 10}
                                    fill="white"
                                    fontSize="10"
                                    stroke="black"
                                    strokeWidth="0.5"
                                >
                                    Место надписи
                                </text>
                            </g>
                        )}
                    </svg>
                )}

                {/* Линейки (рулетки по бокам) */}
                {!isAdmin && <Rulers cameraParams={cameraParams} viewportRef={viewportRef} />}

                {isAdmin && (
                    <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs uppercase font-bold text-gray-300 pointer-events-none z-10">
                        Административный режим (админ)
                    </div>
                )}
            </div>

            {/* Панель админа */}
            {isAdmin && (
                <div className="w-96 bg-gray-800 border-l border-gray-700 p-4 flex flex-col h-full overflow-y-auto shadow-2xl z-10">
                    <h2 className="text-lg font-bold border-b border-gray-600 pb-2 mb-4">Настройки сцены</h2>

                    <div className="space-y-6">
                        {stlModels.map((model) => (
                            <div key={model.id} className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                                <div className="flex justify-between items-center mb-4 border-b border-gray-600 pb-2">
                                    <span className="font-semibold text-blue-300 truncate w-48 text-sm" title={model.name}>
                                        {model.name}
                                    </span>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={model.visible}
                                            onChange={(e) => updateModel(model.id, 'visible', e.target.checked)}
                                            className="w-4 h-4 accent-blue-500"
                                        />
                                        Видим
                                    </label>
                                </div>

                                <div className="mb-3">
                                    <span className="text-xs text-gray-400 block mb-1">Позиция (мм)</span>
                                    <div className="flex gap-2 items-center">
                                        {['X', 'Y', 'Z'].map((axis, idx) => (
                                            <div key={axis} className="flex-1 relative">
                                                <span className={`absolute left-1 top-1 text-[10px] font-bold ${axisColorMap[axis]}`}>
                                                    {axis}
                                                </span>
                                                <input
                                                    type="number"
                                                    step="1"
                                                    value={model.position[idx]}
                                                    onChange={(e) => updateVector(model.id, 'position', idx, e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-600 focus:border-blue-500 rounded p-1 pl-4 text-xs text-center outline-none transition"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="mb-3">
                                    <span className="text-xs text-gray-400 block mb-1">Поворот (градусы)</span>
                                    <div className="flex gap-2 items-center">
                                        {['X', 'Y', 'Z'].map((axis, idx) => (
                                            <div key={axis} className="flex-1 relative">
                                                <span className={`absolute left-1 top-1 text-[10px] font-bold ${axisColorMap[axis]}`}>
                                                    {axis}
                                                </span>
                                                <input
                                                    type="number"
                                                    step="5"
                                                    value={model.rotation[idx]}
                                                    onChange={(e) => updateVector(model.id, 'rotation', idx, e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-600 focus:border-blue-500 rounded p-1 pl-4 text-xs text-center outline-none transition"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-4 items-center mt-4">
                                    <div className="flex-1">
                                        <span className="text-xs text-gray-400 block mb-1">Цвет</span>
                                        <input
                                            type="color"
                                            value={model.color}
                                            onChange={(e) => updateModel(model.id, 'color', e.target.value)}
                                            className="w-full h-8 cursor-pointer rounded bg-gray-900 border border-gray-600 p-0.5"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-xs text-gray-400 block mb-1">Прозрачность</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={model.opacity}
                                            onChange={(e) => updateModel(model.id, 'opacity', parseFloat(e.target.value))}
                                            className="w-full accent-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-4 border-t border-gray-700">
                        <button
                            onClick={saveScene}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg shadow-lg transition"
                        >
                            Сохранить сцену
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
