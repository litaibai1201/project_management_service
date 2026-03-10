import React from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import AppRouter from '@/router'

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhTW}
      theme={{
        token: {
          colorPrimary:         '#2563eb',
          colorPrimaryHover:    '#1d4ed8',
          borderRadius:         8,
          borderRadiusLG:       12,
          colorBgContainer:     '#ffffff',
          colorBgLayout:        '#f1f5f9',
          colorBorder:          '#e2e8f0',
          colorBorderSecondary: '#f1f5f9',
          boxShadow:            '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
          boxShadowSecondary:   '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
          fontFamily:           "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize:             14,
          colorTextBase:        '#0f172a',
          colorTextSecondary:   '#64748b',
          colorTextTertiary:    '#94a3b8',
          colorSuccess:         '#16a34a',
          colorWarning:         '#d97706',
          colorError:           '#dc2626',
          colorInfo:            '#2563eb',
        },
        components: {
          Layout: {
            siderBg:   '#0f172a',
            triggerBg: '#1e293b',
            bodyBg:    '#f1f5f9',
          },
          Menu: {
            darkItemBg:         '#0f172a',
            darkItemSelectedBg: '#2563eb',
            darkSubMenuItemBg:  '#1e293b',
            darkItemColor:      '#94a3b8',
            darkItemSelectedColor: '#ffffff',
            darkItemHoverColor: '#e2e8f0',
            darkItemHoverBg:    '#1e293b',
            itemHeight:         44,
          },
          Card: {
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
          },
          Table: {
            headerBg:          '#f8fafc',
            headerColor:       '#475569',
            rowHoverBg:        '#f0f7ff',
            borderColor:       '#e2e8f0',
            headerSplitColor:  '#e2e8f0',
          },
          Button: {
            borderRadius: 8,
            fontWeight:   500,
          },
          Input: {
            borderRadius: 8,
          },
          Select: {
            borderRadius: 8,
          },
          Tag: {
            borderRadius: 6,
          },
          Badge: {
          },
        },
      }}
    >
      <AntApp>
        <AppRouter />
      </AntApp>
    </ConfigProvider>
  )
}

export default App
