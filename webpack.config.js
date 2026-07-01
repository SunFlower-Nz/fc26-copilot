import path from 'path';
import CopyPlugin from 'copy-webpack-plugin';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: {
      'background/service-worker': './background/service-worker.js',
      'content/content-script': './content/content-script.js',
      'content/page-inject': './content/page-inject.js',
      'ui/popup': './ui/popup.js',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    devtool: isDev ? 'inline-source-map' : false,
    module: {
      rules: [],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'manifest.json', to: '.' },
          { from: 'ui/popup.html', to: 'ui/' },
          { from: 'ui/popup.css', to: 'ui/' },
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js'],
    },
    optimization: {
      minimize: !isDev,
    },
  };
};
