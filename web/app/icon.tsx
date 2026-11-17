import { ImageResponse } from 'next/og';

export const size = {
  width: 128,
  height: 128,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <svg width="128" height="128" viewBox="0 0 100 100" fill="none">
          {/* พื้นหลังวงกลมสีม่วง */}
          <circle cx="50" cy="50" r="49" fill="#671AE6" />

          {/* ตัว G ทรงโค้งมนสีขาวเส้นหนา */}
          <path
            d="M 76.3 33.6 A 31 31 0 1 0 80.85 47 L 50 47 L 50 60 L 62.49 60 A 16 16 0 1 1 63.6 41.5 Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  );
}