import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

const WIDTH = 600;
const HEIGHT = 200;

// Signature canvas for touch, pen and mouse (Pointer Events). The drawing
// surface is always white with dark ink so the exported PNG reads the same in
// light and dark mode. Exposes clear() and toDataURL() through the ref.
const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  const reset = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  };

  useEffect(reset, []);

  useImperativeHandle(ref, () => ({
    clear() {
      reset();
      setEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => empty,
    toDataURL: () => canvasRef.current.toDataURL('image/png'),
  }));

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  };

  const start = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    // A tap leaves a dot.
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    if (empty) {
      setEmpty(false);
      onChange?.(false);
    }
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => { drawing.current = false; };

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      aria-label="Zone de signature"
      className="w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-500 bg-white"
      style={{ touchAction: 'none', aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    />
  );
});

export default SignaturePad;
