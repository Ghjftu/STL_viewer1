import React, { useEffect, useState, useRef } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

// --- КОМПОНЕНТ ДЛЯ ЗАГРУЗКИ И ОТРИСОВКИ STL-МОДЕЛИ ---
const STLMesh: React.FC<{ model: any }> = ({ model }) => {
  const geometry = useLoader(STLLoader, model.url);
  const geometries = Array.isArray(geometry) ? geometry : [geometry];

  const rot = model.rotation || [0, 0, 0];
  const rotationInRadians: [number, number, number] = [
    THREE.MathUtils.degToRad(rot[0]),
    THREE.MathUtils.degToRad(rot[1]),
    THREE.MathUtils.degToRad(rot[2]),
  ];

  return (
    <group position={model.position} rotation={rotationInRadians} visible={model.visible}>
      {geometries.map((geom, idx) => (
        <mesh key={idx} geometry={geom}>
          <meshStandardMaterial
            color={model.color}
            transparent={model.opacity < 1}
            opacity={model.opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};

// --- ФИКСИРОВАННАЯ КАМЕРА ---
const FixedCamera: React.FC<{ cameraState: any }> = ({ cameraState }) => {
  const { camera } = useThree();
  useEffect(() => {
    if (!cameraState) return;
    if (camera instanceof THREE.OrthographicCamera) {
      if (cameraState.position && Array.isArray(cameraState.position)) {
        camera.position.set(cameraState.position[0], cameraState.position[1], cameraState.position[2]);
      }
      if (cameraState.rotation && Array.isArray(cameraState.rotation)) {
        camera.rotation.set(cameraState.rotation[0], cameraState.rotation[1], cameraState.rotation[2]);
      }
      if (cameraState.zoom) camera.zoom = cameraState.zoom;
      camera.updateProjectionMatrix();
    }
  }, [cameraState, camera]);
  return null;
};

export const SketchViewer: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [project, setProject] = useState<any>(null);
  const [stlModels, setStlModels] = useState<any[]>([]);
  const [sketches, setSketches] = useState<any[]>([]);
  const [currentSketchIndex, setCurrentSketchIndex] = useState(0);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    Promise.all([
      fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json()),
      fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => res.json())
    ])
      .then(([projectData, sketchesData]) => {
        setProject(projectData.project);
        setStlModels(projectData.stlFiles || []);
        setSketches(sketchesData);
        if (sketchesData.length > 0) {
          loadSketchSvg(sketchesData[0].folderNumber);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  const loadSketchSvg = (folderNumber: number) => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches/${folderNumber}/svg`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.text())
      .then((svg) => {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svg, "image/svg+xml");
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
        } catch (e) {
          console.error("Ошибка парсинга SVG:", e);
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

  // --- Функции для скачивания ---
  const downloadSvg = async (folderNumber: number) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}/sketches/${folderNumber}/svg`, {
        headers: { Authorization: `Bearer ${token}` }
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
      console.error('Ошибка скачивания SVG:', error);
    }
  };

  const downloadJson = (sketch: any) => {
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
  if (!project || sketches.length === 0) return <div className="h-screen bg-gray-900 text-red-500 flex items-center justify-center">Нет сохранённых эскизов</div>;

  const currentSketch = sketches[currentSketchIndex];
  const textNotes = currentSketch.textNotes || [];

  const anchorWidth = currentSketch.cameraState?.viewportWidth || containerRef.current?.clientWidth || 800;
  const anchorHeight = currentSketch.cameraState?.viewportHeight || containerRef.current?.clientHeight || 600;

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">

      {/* Левая панель */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto flex flex-col z-20 shrink-0">
        <h2 className="text-xl font-bold mb-4">Эскизы проекта</h2>
        <div className="space-y-2 mb-6">
          {sketches.map((sketch, idx) => (
            <div key={sketch.id} className="flex items-center">
              <button
                onClick={() => handleSketchChange(idx)}
                className={`flex-1 text-left p-3 rounded-lg transition ${
                  idx === currentSketchIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <div className="font-bold">Эскиз #{sketch.folderNumber}</div>
                <div className="text-xs opacity-75">{new Date(sketch.createdAt).toLocaleString()}</div>
              </button>
              <div className="flex flex-col ml-2 space-y-1">
                <button
                  onClick={(e) => { e.stopPropagation(); downloadSvg(sketch.folderNumber); }}
                  className="p-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                  title="Скачать SVG"
                >
                  SVG
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadJson(sketch); }}
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

      {/* Основная область: Canvas + наложение SVG */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white">
        <Canvas
          className="w-full h-full absolute inset-0"
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => gl.setClearColor('#ffffff')}
        >
          <OrthographicCamera makeDefault position={[0, 0, 150]} zoom={2} />
          <FixedCamera cameraState={currentSketch.cameraState} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[50, 50, 50]} intensity={1.5} />
          <directionalLight position={[-50, -50, -50]} intensity={0.5} />
          {stlModels.map(model => (
            <STLMesh key={model.id} model={model} />
          ))}
        </Canvas>

        {/* Якорь для SVG */}
        {svgContent && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center overflow-visible">
            <div 
              style={{ 
                width: anchorWidth, 
                height: anchorHeight, 
                position: 'relative',
                flexShrink: 0
              }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        )}
      </div>

      {/* Правая панель */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto flex flex-col z-20 shrink-0">
        <h2 className="text-xl font-bold mb-4">Комментарии врача</h2>
        {textNotes.length > 0 ? (
          <div className="space-y-3">
            {textNotes.map((note: any) => (
              <div key={note.id} className="bg-gray-700 p-3 rounded-lg text-sm border-l-4 border-blue-500">
                <span className="text-blue-400 font-mono text-xs block mb-1">Заметка #{note.id}</span>
                <span className="text-gray-100 leading-relaxed">{note.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 text-sm text-center mt-4">
            Нет комментариев для этого эскиза
          </div>
        )}
      </div>

    </div>
  );
};