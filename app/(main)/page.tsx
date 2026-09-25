import { CSSProperties } from 'react';
import Image from 'next/image';
import BPLogo from '@/assets/images/bp-logo.png';
import ConfirmationDialog from '@/components/home/ConfirmationDialog';
import LogoutButton from '@/components/home/LogoutButton';

export default function Home() {
  return (
    <main style={mainStyles}>
      <ConfirmationDialog />

      <Image style={imageStyles} src={BPLogo} alt="Blueprint Logo" />
      <p style={textStyles}>Open up app/page.tsx to get started!</p>
      <LogoutButton />
    </main>
  );
}

// CSS styles

const mainStyles: CSSProperties = {
  width: '100%',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
};

const textStyles: CSSProperties = {
  marginBottom: '1.5rem',
};

const imageStyles: CSSProperties = {
  width: '80px',
  height: '80px',
  marginBottom: '0.5rem',
};
