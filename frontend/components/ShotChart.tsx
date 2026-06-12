'use client';

import React, { useEffect, useRef } from 'react';

interface Shot {
  x: number;
  y: number;
  made: boolean;
  player: string;
  team: string;
  time: string;
  is_three: boolean;
  x_oneside?: number;
  y_oneside?: number;
}

interface ShotChartProps {
  shots: Shot[];
  width?: number;
  height?: number;
  halfCourt?: boolean;
  showLegend?: boolean;
}

const ShotChart: React.FC<ShotChartProps> = ({ 
  shots, 
  width = 940, 
  height = 500,
  halfCourt = false,
  showLegend = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set up scaling
    const courtWidth = halfCourt ? 470 : 940;
    const courtHeight = 500;
    const scale = width / courtWidth;

    // Draw court
    drawCourt(ctx, scale, halfCourt);

    // Draw shots
    shots.forEach(shot => {
      const x = halfCourt && shot.x_oneside ? shot.x_oneside * scale : shot.x * scale;
      const y = halfCourt && shot.y_oneside ? shot.y_oneside * scale : shot.y * scale;
      
      drawShot(ctx, x, y, shot.made, shot.is_three);
    });

    // Draw legend
    if (showLegend) {
      drawLegend(ctx, width, height);
    }
  }, [shots, width, height, halfCourt, showLegend]);

  const drawCourt = (ctx: CanvasRenderingContext2D, scale: number, halfCourt: boolean) => {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    if (halfCourt) {
      // Half court dimensions (in feet, then scaled)
      const courtWidth = 47 * 10 * scale;
      const courtHeight = 50 * 10 * scale;

      // Court outline
      ctx.strokeRect(0, 0, courtWidth, courtHeight);

      // Center line
      ctx.beginPath();
      ctx.moveTo(courtWidth, 0);
      ctx.lineTo(courtWidth, courtHeight);
      ctx.stroke();

      // Three-point arc
      const threePointRadius = 23.75 * 10 * scale;
      const basketX = courtWidth - 5.25 * 10 * scale;
      const basketY = courtHeight / 2;

      ctx.beginPath();
      ctx.arc(basketX, basketY, threePointRadius, -Math.PI/2, Math.PI/2);
      ctx.stroke();

      // Corner three-point lines
      ctx.beginPath();
      ctx.moveTo(courtWidth - 3 * 10 * scale, 0);
      ctx.lineTo(courtWidth - 3 * 10 * scale, 14 * 10 * scale);
      ctx.moveTo(courtWidth - 3 * 10 * scale, courtHeight);
      ctx.lineTo(courtWidth - 3 * 10 * scale, courtHeight - 14 * 10 * scale);
      ctx.stroke();

      // Free throw lane
      const laneWidth = 12 * 10 * scale;
      const laneLength = 19 * 10 * scale;
      const laneX = courtWidth - laneLength;
      const laneY = (courtHeight - laneWidth) / 2;

      ctx.strokeRect(laneX, laneY, laneLength, laneWidth);

      // Free throw circle
      const ftRadius = 6 * 10 * scale;
      ctx.beginPath();
      ctx.arc(laneX, basketY, ftRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Basket
      const basketRadius = 0.75 * 10 * scale;
      ctx.beginPath();
      ctx.arc(basketX, basketY, basketRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#FF6600';
      ctx.fill();
      ctx.stroke();

    } else {
      // Full court
      const courtWidth = 94 * 10 * scale;
      const courtHeight = 50 * 10 * scale;

      // Court outline
      ctx.strokeRect(0, 0, courtWidth, courtHeight);

      // Center line
      ctx.beginPath();
      ctx.moveTo(courtWidth / 2, 0);
      ctx.lineTo(courtWidth / 2, courtHeight);
      ctx.stroke();

      // Center circle
      const centerRadius = 6 * 10 * scale;
      ctx.beginPath();
      ctx.arc(courtWidth / 2, courtHeight / 2, centerRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw both halves
      for (let side = 0; side < 2; side++) {
        const offsetX = side === 0 ? 0 : courtWidth / 2;
        const basketX = side === 0 ? 5.25 * 10 * scale : courtWidth - 5.25 * 10 * scale;
        const basketY = courtHeight / 2;

        // Three-point arc
        const threePointRadius = 23.75 * 10 * scale;
        ctx.beginPath();
        if (side === 0) {
          ctx.arc(basketX, basketY, threePointRadius, -Math.PI/2, Math.PI/2, true);
        } else {
          ctx.arc(basketX, basketY, threePointRadius, -Math.PI/2, Math.PI/2);
        }
        ctx.stroke();

        // Corner three-point lines
        ctx.beginPath();
        if (side === 0) {
          ctx.moveTo(3 * 10 * scale, 0);
          ctx.lineTo(3 * 10 * scale, 14 * 10 * scale);
          ctx.moveTo(3 * 10 * scale, courtHeight);
          ctx.lineTo(3 * 10 * scale, courtHeight - 14 * 10 * scale);
        } else {
          ctx.moveTo(courtWidth - 3 * 10 * scale, 0);
          ctx.lineTo(courtWidth - 3 * 10 * scale, 14 * 10 * scale);
          ctx.moveTo(courtWidth - 3 * 10 * scale, courtHeight);
          ctx.lineTo(courtWidth - 3 * 10 * scale, courtHeight - 14 * 10 * scale);
        }
        ctx.stroke();

        // Free throw lane
        const laneWidth = 12 * 10 * scale;
        const laneLength = 19 * 10 * scale;
        const laneX = side === 0 ? 0 : courtWidth - laneLength;
        const laneY = (courtHeight - laneWidth) / 2;

        ctx.strokeRect(laneX, laneY, laneLength, laneWidth);

        // Free throw circle
        const ftRadius = 6 * 10 * scale;
        ctx.beginPath();
        ctx.arc(laneX + (side === 0 ? laneLength : 0), basketY, ftRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Basket
        const basketRadius = 0.75 * 10 * scale;
        ctx.beginPath();
        ctx.arc(basketX, basketY, basketRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FF6600';
        ctx.fill();
        ctx.stroke();
      }
    }
  };

  const drawShot = (
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    made: boolean, 
    isThree: boolean
  ) => {
    const radius = 5;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    if (made) {
      ctx.fillStyle = '#00FF00';
      ctx.fill();
    } else {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw X for misses
      ctx.beginPath();
      ctx.moveTo(x - radius, y - radius);
      ctx.lineTo(x + radius, y + radius);
      ctx.moveTo(x + radius, y - radius);
      ctx.lineTo(x - radius, y + radius);
      ctx.stroke();
    }
    
    // Add border for 3-pointers
    if (isThree) {
      ctx.strokeStyle = '#0000FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const drawLegend = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const legendX = width - 150;
    const legendY = 20;
    const spacing = 25;

    ctx.fillStyle = '#000';
    ctx.font = '14px Arial';
    ctx.fillText('Legend:', legendX, legendY);

    // Made shot
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + spacing, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00FF00';
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText('Made', legendX + 25, legendY + spacing + 5);

    // Missed shot
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + spacing * 2, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(legendX + 5, legendY + spacing * 2 - 5);
    ctx.lineTo(legendX + 15, legendY + spacing * 2 + 5);
    ctx.moveTo(legendX + 15, legendY + spacing * 2 - 5);
    ctx.lineTo(legendX + 5, legendY + spacing * 2 + 5);
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fillText('Missed', legendX + 25, legendY + spacing * 2 + 5);

    // 3-pointer
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + spacing * 3, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#00FF00';
    ctx.fill();
    ctx.strokeStyle = '#0000FF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY + spacing * 3, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fillText('3-Pointer', legendX + 25, legendY + spacing * 3 + 5);
  };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border border-gray-300 rounded-lg shadow-md"
    />
  );
};

export default ShotChart;