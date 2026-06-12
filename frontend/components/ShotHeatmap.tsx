'use client';

import React, { useEffect, useRef } from 'react';

interface Shot {
  x: number;
  y: number;
  made: boolean;
  x_oneside?: number;
  y_oneside?: number;
}

interface ShotHeatmapProps {
  shots: Shot[];
  width?: number;
  height?: number;
  halfCourt?: boolean;
  cellSize?: number;
}

const ShotHeatmap: React.FC<ShotHeatmapProps> = ({ 
  shots, 
  width = 470, 
  height = 500,
  halfCourt = true,
  cellSize = 20
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate heatmap data
    const heatmapData = calculateHeatmap(shots, width, height, cellSize, halfCourt);

    // Draw heatmap
    drawHeatmap(ctx, heatmapData, cellSize);

    // Draw court overlay
    const scale = width / (halfCourt ? 470 : 940);
    drawCourtOverlay(ctx, scale, halfCourt);

  }, [shots, width, height, halfCourt, cellSize]);

  const calculateHeatmap = (
    shots: Shot[], 
    width: number, 
    height: number, 
    cellSize: number,
    halfCourt: boolean
  ) => {
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const grid: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));
    const madeGrid: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0));

    shots.forEach(shot => {
      const x = halfCourt && shot.x_oneside ? shot.x_oneside : shot.x;
      const y = halfCourt && shot.y_oneside ? shot.y_oneside : shot.y;
      
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        grid[row][col]++;
        if (shot.made) {
          madeGrid[row][col]++;
        }
      }
    });

    // Calculate shooting percentage for each cell
    const percentageGrid = grid.map((row, i) => 
      row.map((attempts, j) => {
        if (attempts === 0) return null;
        return madeGrid[i][j] / attempts;
      })
    );

    return { grid, percentageGrid, cols, rows };
  };

  const drawHeatmap = (
    ctx: CanvasRenderingContext2D,
    heatmapData: any,
    cellSize: number
  ) => {
    const { grid, percentageGrid, cols, rows } = heatmapData;

    // Find max attempts for normalization
    const maxAttempts = Math.max(...grid.flat());

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const attempts = grid[row][col];
        const percentage = percentageGrid[row][col];

        if (attempts > 0) {
          // Calculate opacity based on number of attempts
          const opacity = Math.min(0.8, attempts / maxAttempts);

          // Calculate color based on shooting percentage
          let color: string;
          if (percentage === null) {
            color = 'rgba(128, 128, 128';
          } else if (percentage >= 0.5) {
            // Good shooting percentage - green
            const intensity = Math.floor(255 * percentage);
            color = `rgba(0, ${intensity}, 0`;
          } else {
            // Poor shooting percentage - red
            const intensity = Math.floor(255 * (1 - percentage));
            color = `rgba(${intensity}, 0, 0`;
          }

          ctx.fillStyle = `${color}, ${opacity})`;
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
  };

  const drawCourtOverlay = (
    ctx: CanvasRenderingContext2D, 
    scale: number, 
    halfCourt: boolean
  ) => {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;

    if (halfCourt) {
      const courtWidth = 47 * 10 * scale;
      const courtHeight = 50 * 10 * scale;

      // Court outline
      ctx.strokeRect(0, 0, courtWidth, courtHeight);

      // Three-point arc
      const threePointRadius = 23.75 * 10 * scale;
      const basketX = courtWidth - 5.25 * 10 * scale;
      const basketY = courtHeight / 2;

      ctx.beginPath();
      ctx.arc(basketX, basketY, threePointRadius, -Math.PI/2, Math.PI/2);
      ctx.stroke();

      // Free throw lane
      const laneWidth = 12 * 10 * scale;
      const laneLength = 19 * 10 * scale;
      const laneX = courtWidth - laneLength;
      const laneY = (courtHeight - laneWidth) / 2;

      ctx.strokeRect(laneX, laneY, laneLength, laneWidth);

      // Basket
      const basketRadius = 0.75 * 10 * scale;
      ctx.beginPath();
      ctx.arc(basketX, basketY, basketRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 102, 0, 0.8)';
      ctx.fill();
      ctx.stroke();
    }
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 rounded-lg shadow-md"
      />
      <div className="mt-4 flex items-center justify-center space-x-4 text-sm">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-red-500 opacity-60 mr-2 rounded"></div>
          <span>Poor Shooting %</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-green-500 opacity-60 mr-2 rounded"></div>
          <span>Good Shooting %</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-gray-500 opacity-20 mr-2 rounded"></div>
          <span>Low Volume</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-gray-500 opacity-80 mr-2 rounded"></div>
          <span>High Volume</span>
        </div>
      </div>
    </div>
  );
};

export default ShotHeatmap;