
import React from 'react';

interface AvatarProps {
  name: string;
  avatarUrl?: string;
}

const getInitials = (name: string): string => {
  if (!name) return '?';
  const words = name.split(' ').filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 3).toUpperCase();
};

// Simple hashing function to get a color from a string
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};


const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl }) => {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-full h-full rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  const initials = getInitials(name);
  const color = stringToColor(name);

  return (
    <div
      className="w-full h-full rounded-full flex items-center justify-center font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
};

export default Avatar;