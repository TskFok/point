import { renderToStaticMarkup } from 'react-dom/server';
import Home from '../app/page';

describe('Home', () => {
  it('显示产品名和 API 状态占位', () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain('Point Quest');
    expect(markup).toContain('API 状态：待连接');
  });
});
