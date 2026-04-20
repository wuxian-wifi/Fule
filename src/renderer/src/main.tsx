import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './index.css'

/**
 * 渲染进程入口，使用 StrictMode 启用严格模式检查
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
