import { createRoot } from 'react-dom/client';
import App from './renderer/App.jsx';
import './index.css';

const container = document.getElementById('app');
if (!container) throw new Error('The application root element is missing.');

createRoot(container).render(<App />);
