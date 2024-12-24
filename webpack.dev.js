import { merge } from 'webpack-merge';
import webpack from 'webpack';
import config from './webpack.config.js';

export default merge(config, {
  mode: "development",
  devtool: "eval-source-map",
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('development')
    })
  ],
  devServer: {
    static: {
      directory: "./dist",
      publicPath: '/',
    },
    hot: true,
    open: true,
    compress: true,
    historyApiFallback: true,
    port: 8080,
    watchFiles: ['src/**/*'],
    client: {
      overlay: true,
      progress: true,
    },
    devMiddleware: {
      writeToDisk: true,
    },
  },
});
