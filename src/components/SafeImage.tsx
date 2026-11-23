import React, { useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackTitle,
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className="w-full h-full bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 flex flex-col items-center justify-center p-4 text-center border border-slate-200/60"
        aria-label={alt}
      >
        <MonitorSmartphone className="w-8 h-8 text-blue-700/60 mb-2" />
        <span className="text-xs font-medium text-slate-500 line-clamp-2 max-w-[160px]">
          {fallbackTitle || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
