import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import * as THREE from 'three';

// --- КОМПОНЕНТ ДЛЯ ОТСЛЕЖИВАНИЯ КАМЕРЫ ---
// Вместо вычисления зума, мы сохраняем ссылку на саму 3D камеру, 
// чтобы делать точные математические расчеты из 2D в 3D.
const CameraTracker = ({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.OrthographicCamera | null> }) => {
  const { camera } = useThree();
  useEffect(() => {
    cameraRef.current = camera as THREE.OrthographicCamera;
  }, [camera, cameraRef]);
  return null;
};

// --- КОМПОНЕНТ ЗАГРУЗКИ И ОТРИСОВКИ STL-МОДЕЛИ ---
const STLMesh = ({ model }: { model: any }) => {
  const geometry = useLoader(STLLoader, model.url);
  const rot = model.rotation || [0, 0, 0];
  const rotationInRadians: [number, number, number] = [
    THREE.MathUtils.degToRad(rot[0]),
    THREE.MathUtils.degToRad(rot[1]),
    THREE.MathUtils.degToRad(rot[2]),
  ];

  return (
    <mesh position={model.position} rotation={rotationInRadians} visible={model.visible}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        color={model.color}
        transparent={true}
        opacity={model.opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// --- ТИПЫ ДЛЯ ИНСТРУМЕНТОВ И РИСОВАНИЯ ---
type ToolType = 'none' | 'ruler' | 'angle' | 'circle' | 'brush';
type Point = { x: number; y: number };
type Drawing =
  | { type: 'ruler'; points: Point[]; value: number }
  | { type: 'angle'; points: Point[]; value: number }
  | { type: 'circle'; points: Point[]; value: number }
  | { type: 'brush'; points: Point[]; color: string };

// --- ГЛАВНЫЙ КОМПОНЕНТ ---
export const Viewer3D: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = new URLSearchParams(location.search).get('mode') === 'admin';

  // Состояния для данных проекта
  const [project, setProject] = useState<any>(null);
  const [stlModels, setStlModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Состояния для инструментов рисования
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isDrawingBrush, setIsDrawingBrush] = useState(false);

  // Refs
  const svgRef = useRef<SVGSVGElement>(null);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  // --- 1. ПРОВЕРКА АУТЕНТИФИКАЦИИ ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log("🔒 Доступ ограничен. Редирект на логин...");
      const currentPath = location.pathname + location.search;
      localStorage.setItem('returnUrl', currentPath);
      navigate('/', { replace: true });
    }
  }, [navigate, location]);

  // --- 2. ЗАГРУЗКА ДАННЫХ ПРОЕКТА С ТОКЕНОМ ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);

    fetch(`http://localhost:8000/api/projects/${id}`, {
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
        }
      })
      .catch((err) => console.error('Ошибка загрузки:', err))
      .finally(() => setLoading(false));
  }, [id, navigate, location]);

  // --- 3. ТОЧНЫЙ 3D-РАСЧЕТ ИЗМЕРЕНИЙ ---
  
  // Конвертация 2D пикселей экрана в 3D координаты мира
  const unprojectPoint = (p: Point): THREE.Vector3 => {
    if (!cameraRef.current || !svgRef.current) return new THREE.Vector3();
    const rect = svgRef.current.getBoundingClientRect();
    
    // Нормализованные координаты устройства (от -1 до +1)
    const ndcX = (p.x / rect.width) * 2 - 1;
    const ndcY = -(p.y / rect.height) * 2 + 1;
    
    // Проецируем вектор через матрицу камеры
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(cameraRef.current);
    return vector;
  };

  const calculateDistance = (p1: Point, p2: Point) => {
    const v1 = unprojectPoint(p1);
    const v2 = unprojectPoint(p2);
    // Расстояние между векторами в 3D пространстве
    return v1.distanceTo(v2).toFixed(1);
  };

  const calculateAngle = (p1: Point, p2: Point, p3: Point) => {
    const v1 = unprojectPoint(p1);
    const v2 = unprojectPoint(p2); // Центр угла
    const v3 = unprojectPoint(p3);
    
    // Вектора от центра к краям
    const vec1 = v1.clone().sub(v2);
    const vec2 = v3.clone().sub(v2);
    
    // Получаем угол и переводим в градусы
    const angleRad = vec1.angleTo(vec2);
    return THREE.MathUtils.radToDeg(angleRad).toFixed(1);
  };

  // --- 4. ОБРАБОТЧИКИ СОБЫТИЙ ДЛЯ РИСОВАНИЯ НА SVG ---
  const handleSvgClick = (e: React.MouseEvent) => {
    if (activeTool === 'none' || activeTool === 'brush') return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newPoint = { x, y };

    if (activeTool === 'ruler') {
      if (currentPoints.length === 0) {
        setCurrentPoints([newPoint]);
      } else {
        const dist = parseFloat(calculateDistance(currentPoints[0], newPoint));
        setDrawings([...drawings, { type: 'ruler', points: [currentPoints[0], newPoint], value: dist }]);
        setCurrentPoints([]);
      }
    } else if (activeTool === 'circle') {
      if (currentPoints.length === 0) {
        setCurrentPoints([newPoint]); // центр
      } else {
        const radius = parseFloat(calculateDistance(currentPoints[0], newPoint));
        setDrawings([...drawings, { type: 'circle', points: [currentPoints[0], newPoint], value: radius * 2 }]);
        setCurrentPoints([]);
      }
    } else if (activeTool === 'angle') {
      const pts = [...currentPoints, newPoint];
      if (pts.length < 3) {
        setCurrentPoints(pts);
      } else {
        const deg = parseFloat(calculateAngle(pts[0], pts[1], pts[2]));
        setDrawings([...drawings, { type: 'angle', points: pts, value: deg }]);
        setCurrentPoints([]);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeTool !== 'brush') return;
    setIsDrawingBrush(true);
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) setCurrentPoints([{ x: clientX - rect.left, y: clientY - rect.top }]);
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingBrush || activeTool !== 'brush') return;
    const { clientX, clientY } = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) setCurrentPoints((prev) => [...prev, { x: clientX - rect.left, y: clientY - rect.top }]);
  };

  const handleMouseUp = () => {
    if (activeTool === 'brush' && isDrawingBrush) {
      setIsDrawingBrush(false);
      setDrawings([...drawings, { type: 'brush', points: currentPoints, color: 'red' }]);
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

  // --- 5. ФУНКЦИИ ДЛЯ АДМИНА ---
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
      const response = await fetch(`http://localhost:8000/api/projects/${id}/scene`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sceneState: stlModels }),
      });
      if (response.ok) {
        alert('✅ Сцена сохранена!');
      } else {
        alert('❌ Ошибка сохранения');
      }
    } catch (error) {
      console.error(error);
      alert('Ошибка сети');
    }
  };

  if (loading) return <div className="h-screen bg-gray-900 text-white flex items-center justify-center">Загрузка...</div>;
  if (!project) return <div className="h-screen bg-gray-900 text-red-500 flex items-center justify-center">Проект не найден</div>;

  const tools = [
    { id: 'ruler', icon: '📏', label: 'Линейка' },
    { id: 'angle', icon: '📐', label: 'Угол' },
    { id: 'circle', icon: '⭕', label: 'Диаметр' },
    { id: 'brush', icon: '✏️', label: 'Эскиз' },
  ];

  // Мапа цветов для осей (решает проблему с вырезанием стилей Tailwind)
  const axisColorMap: Record<string, string> = {
    X: 'text-red-500',
    Y: 'text-green-500',
    Z: 'text-blue-500'
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans">
      {/* 3D СЦЕНА */}
      <div className="flex-1 relative flex items-center justify-center">
        <Canvas className="w-full h-full">
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
          <gridHelper args={[200, 50, '#444444', '#222222']} rotation={[Math.PI / 2, 0, 0]} />
          <axesHelper args={[100]} />
          <Suspense fallback={null}>
            {stlModels.map((model) => (
              <STLMesh key={model.id} model={model} />
            ))}
          </Suspense>
        </Canvas>

        {/* ИНТЕРФЕЙС ДЛЯ ВРАЧА */}
        {!isAdmin && (
          <>
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[95%] sm:w-auto max-w-2xl bg-gray-800/90 text-white px-4 sm:px-6 py-2 rounded-2xl sm:rounded-full shadow-xl border border-gray-600 flex flex-wrap justify-center items-center gap-2 sm:gap-4 z-20">
              <span className="text-xs sm:text-sm text-gray-400">Пациент:</span>
              <span className="font-bold text-blue-400 text-sm">{project?.patient_name}</span>
              <div className="hidden sm:block h-4 w-[1px] bg-gray-600"></div>
              <span className="text-xs sm:text-sm text-gray-400">Врач:</span>
              <span className="font-bold text-white text-sm">{project?.doctor_display_name}</span>
            </div>

            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[95%] sm:w-auto bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 p-2 flex flex-wrap justify-center items-center gap-2 z-20">
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
                onClick={() => alert('ТЗ сформировано!')}
                className="px-3 sm:px-4 py-2 sm:py-0 h-10 sm:h-12 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-[10px] sm:text-xs"
              >
                ГОТОВО
              </button>
            </div>

            {activeTool !== 'none' && (
              <div className="absolute top-20 sm:top-24 left-1/2 transform -translate-x-1/2 w-[90%] sm:w-auto text-center bg-blue-600/20 border border-blue-500/50 text-blue-200 px-4 py-1 rounded text-[10px] sm:text-xs font-bold pointer-events-none animate-pulse z-20">
                РЕЖИМ: {tools.find((t) => t.id === activeTool)?.label.toUpperCase()} — Выберите точки
              </div>
            )}
          </>
        )}

        {/* SVG СЛОЙ ДЛЯ РИСОВАНИЯ */}
        {!isAdmin && (
          <svg
            ref={svgRef}
            className={`absolute inset-0 w-full h-full z-10 ${activeTool !== 'none' ? 'cursor-crosshair' : 'pointer-events-none'}`}
            onClick={handleSvgClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
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
                const r = Math.sqrt(
                  Math.pow(d.points[1].x - d.points[0].x, 2) + Math.pow(d.points[1].y - d.points[0].y, 2)
                );
                return (
                  <g key={i}>
                    <circle cx={d.points[0].x} cy={d.points[0].y} r={r} stroke="#ef4444" strokeWidth="2" fill="none" />
                    <text x={d.points[0].x} y={d.points[0].y} fill="#ef4444" fontSize="16" fontWeight="bold">
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
              return null;
            })}

            {activeTool === 'ruler' && currentPoints.length === 1 && (
              <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="blue" />
            )}
            {activeTool === 'circle' && currentPoints.length === 1 && (
              <circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={3} fill="red" />
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
          </svg>
        )}

        {isAdmin && (
          <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded text-xs uppercase font-bold text-gray-300 pointer-events-none z-10">
            Ортографический режим (Админ)
          </div>
        )}
      </div>

      {/* ПАНЕЛЬ АДМИНА */}
      {isAdmin && (
        <div className="w-96 bg-gray-800 border-l border-gray-700 p-4 flex flex-col h-full overflow-y-auto shadow-2xl z-10">
          <h2 className="text-lg font-bold border-b border-gray-600 pb-2 mb-4">Настройка сцены</h2>

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
                  <span className="text-xs text-gray-400 block mb-1">Вращение (градусы)</span>
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