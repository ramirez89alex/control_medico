import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onClose: () => void;
  ancho?: number;
}

export function Modal({ children, onClose, ancho }: Props) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={ancho ? { maxWidth: ancho } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
