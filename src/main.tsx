import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

class ErrorBoundary extends React.Component<{children: React.ReactNode},{error: string}> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="app-shell"><h1>Ошибка приложения</h1><p role="alert">{this.state.error}</p><button onClick={() => location.reload()}>Перезагрузить</button><button onClick={() => {localStorage.removeItem('cvt.game');location.reload();}}>Сбросить сохранённую партию</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
