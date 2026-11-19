import React, { useState, useEffect, useId } from 'react';
import { Building } from 'lucide-react';

interface IngeodronLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  subtitleText?: string;
  subtitleClassName?: string;
  brandSpanClassName?: string;
  iconClassName?: string;
  containerClassName?: string;
  useClientLogo?: boolean;
  clientLogoUrl?: string;
  clientName?: string;
}

export const IngeodronLogo: React.FC<IngeodronLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  subtitleText = 'Fotogravimetria con dron',
  subtitleClassName = 'text-[9px] text-gray-400 font-medium tracking-wider uppercase',
  brandSpanClassName = '',
  iconClassName = '',
  containerClassName = 'gap-2.5',
  useClientLogo = false,
  clientLogoUrl,
  clientName,
}) => {
  const [imgError, setImgError] = useState<boolean>(false);
  const rawId = useId();
  const gid = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    setImgError(false);
  }, [clientLogoUrl]);

  const iconSize = size === 'sm' ? 'w-10 h-7' : size === 'lg' ? 'w-16 h-11' : 'w-13 h-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';
  const showClientImage = useClientLogo && Boolean(clientLogoUrl) && !imgError;

  return (
    <div className={`flex items-center ${containerClassName}`.trim()}>
      {useClientLogo ? (
        <div
          className={`${iconSize} rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center overflow-hidden shrink-0`}
          title={clientName ? `Logo de ${clientName}` : 'Logo del cliente'}
        >
          {showClientImage ? (
            <img
              src={clientLogoUrl}
              alt={clientName || 'Logo cliente'}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain bg-white/95 p-0.5"
            />
          ) : (
            <Building className="w-4 h-4 text-blue-400" />
          )}
        </div>
      ) : (
        <svg
          className={`${iconClassName || iconSize} shrink-0`}
          viewBox="69 32 96 62"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Logo INGEODRON Colibrí"
        >
          <defs>
            <linearGradient id={`colibri-wing-${gid}`} x1="71" y1="40" x2="129" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1a5fb4" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.92" />
            </linearGradient>
            <linearGradient id={`colibri-body-${gid}`} x1="90" y1="56" x2="136" y2="80" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1a5fb4" />
              <stop offset="55%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#bfdbfe" />
            </linearGradient>
            <linearGradient id={`colibri-chest-${gid}`} x1="112" y1="80" x2="144" y2="55" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#dbeafe" />
              <stop offset="50%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#1a5fb4" />
            </linearGradient>
            <linearGradient id={`colibri-head-${gid}`} x1="129" y1="49" x2="150" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="50%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1e40af" />
            </linearGradient>
            <linearGradient id={`colibri-tail-${gid}`} x1="96" y1="91" x2="115" y2="69" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e3a8a" />
              <stop offset="65%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#93c5fd" />
            </linearGradient>
          </defs>
          {/* Upper & inner wings */}
          <path
            d="m 91.909756,34.776259 23.229274,9.697659 -12.14838,3.533256 z"
            fill="#5898e7"
            fillOpacity="0.82"
            stroke="#1e40af"
            strokeWidth="0.25"
            strokeLinejoin="round"
          />
          <path
            d="m 115.13903,44.473918 13.78722,11.171102 -25.9356,-7.637846 z"
            fill="#5898e7"
            fillOpacity="0.9"
            stroke="#1e40af"
            strokeWidth="0.25"
            strokeLinejoin="round"
          />
          <path
            d="M 128.92625,55.64502 71.20638,38.580147 89.519171,55.930688 Z"
            fill={`url(#colibri-wing-${gid})`}
            stroke="#1e3a8a"
            strokeWidth="0.25"
            strokeLinejoin="round"
          />
          {/* Back & upper torso */}
          <path
            d="M 89.519169,55.930688 114.44742,69.071391 127.52163,64.86338 Z"
            fill={`url(#colibri-body-${gid})`}
            stroke="#1e40af"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 89.519169,55.930688 46.699121,-0.210492 -8.69666,9.143184 z"
            fill="#2563eb"
            fillOpacity="0.92"
            stroke="#1e40af"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          {/* Head & nape */}
          <path
            d="m 135.43646,49.946705 -6.51021,5.698315 15.26066,-0.195455 z"
            fill={`url(#colibri-head-${gid})`}
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 135.43646,49.946705 7.15672,-1.262952 7.00638,4.721032 z"
            fill="#3b82f6"
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 135.43646,49.946705 14.1631,3.45808 -3.51822,2.285341 -1.89443,-0.240561 z"
            fill="#1d4ed8"
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          {/* Beak */}
          <path
            d="m 149.59956,53.404786 13.56168,3.478411 -17.0799,-1.053095 z"
            fill="#9a9996"
            stroke="#475569"
            strokeWidth="0.25"
            strokeLinejoin="round"
          />
          {/* Throat, chest & belly */}
          <path
            d="m 136.21829,55.720196 -2.88675,12.268666 5.17209,-5.081873 7.57771,-7.216863 -1.89443,-0.240561 z"
            fill={`url(#colibri-chest-${gid})`}
            stroke="#1e40af"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 146.08134,55.690126 2.88674,0.270632 -10.10361,6.735739 z"
            fill="#60a5fa"
            stroke="#1e40af"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="M 136.21829,55.720196 112.6432,80.618374 133.33154,67.988862 Z"
            fill={`url(#colibri-chest-${gid})`}
            stroke="#1e40af"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 115.3796,79.024648 7.90847,0.180422 10.04347,-11.216208 z"
            fill="#93c5fd"
            stroke="#1d4ed8"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 127.52163,64.86338 -15.08892,4.929699 -1.35316,12.238596 1.56365,-1.413301 z"
            fill="#1e40af"
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          {/* Tail feathers */}
          <path
            d="m 112.43271,69.793079 -12.20853,13.712039 0.0902,5.923841 z"
            fill={`url(#colibri-tail-${gid})`}
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 100.31438,89.428959 10.76517,-7.397284 1.35316,-12.238596 z"
            fill="#2563eb"
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          <path
            d="m 100.22418,83.505116 -4.480466,7.667918 4.570666,-1.744075 z"
            fill="#60a5fa"
            stroke="#1e3a8a"
            strokeWidth="0.2"
            strokeLinejoin="round"
          />
          {/* Eye */}
          <ellipse
            cx="144.80334"
            cy="53.825768"
            rx="0.92"
            ry="0.92"
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="0.35"
          />
        </svg>
      )}
      <div>
        <h1 className={`font-extrabold ${textSize} tracking-wide leading-none select-none`}>
          <span className={`text-blue-500 ${brandSpanClassName}`.trim()}>INGEO</span>
          <span className={`text-amber-500 ${brandSpanClassName}`.trim()}>DRON</span>
        </h1>
        {showSubtitle && (
          <p className={subtitleClassName}>
            {subtitleText}
          </p>
        )}
      </div>
    </div>
  );
};
