import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

const VIEWBOX_WIDTH = 64;
const VIEWBOX_HEIGHT = 38;

export default function ChateraLogo({ width = 40, height, style }) {
  const h = height ?? (width * VIEWBOX_HEIGHT) / VIEWBOX_WIDTH;

  return (
    <Svg
      width={width}
      height={h}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      fill="none"
      style={style}
    >
      <Defs>
        <LinearGradient
          id="chateraGradient"
          x1="64.162"
          y1="18.8832"
          x2="-0.446818"
          y2="18.8832"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#006AFF" />
          <Stop offset="1" stopColor="#006AFF" stopOpacity={0.2} />
        </LinearGradient>
      </Defs>
      <Path
        d="M50.8682 13.2486C47.6529 10.0047 45.2757 4.00755 44.0973 0.551753C43.8464 -0.183917 42.6878 -0.183918 42.4369 0.551752C41.2585 4.00755 38.8813 10.0047 35.6661 13.2486C32.5258 16.4168 13.1704 16.8613 0.704713 18.0773C-0.234905 18.1691 -0.234904 19.831 0.704716 19.9226C13.1704 21.1386 32.5258 21.5832 35.6661 24.7515C38.8813 27.9953 41.2585 33.9924 42.4369 37.4483C42.6878 38.1839 43.8464 38.1839 44.0973 37.4483C45.2757 33.9924 47.6529 27.9953 50.8682 24.7515C54.0833 21.5076 60.0277 21.0264 63.4531 19.8375C64.1823 19.5845 64.1823 18.4155 63.4531 18.1624C60.0277 16.9735 54.0833 16.4925 50.8682 13.2486Z"
        fill="url(#chateraGradient)"
      />
    </Svg>
  );
}
