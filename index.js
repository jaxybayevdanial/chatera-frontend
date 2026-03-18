import { registerRootComponent } from 'expo';

import App from './App';

// На мобильном вебе: viewport сжимается при появлении клавиатуры — поле ввода остаётся видимым
if (typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const content = meta.getAttribute('content') || '';
    if (!content.includes('interactive-widget=')) {
      meta.setAttribute(
        'content',
        content ? `${content}, interactive-widget=resizes-content` : 'width=device-width, initial-scale=1, interactive-widget=resizes-content'
      );
    }
  }
}

registerRootComponent(App);
