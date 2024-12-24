import { merge } from 'webpack-merge';
import webpack from 'webpack';
import config from './webpack.config.js';

export default merge(config, {
  mode: "production",
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    })
  ],
});
