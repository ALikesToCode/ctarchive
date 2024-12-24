import path from 'path';
import { fileURLToPath } from 'url';
import MomentLocalesPlugin from 'moment-locales-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDevelopment = process.env.NODE_ENV !== 'production';

export default {
  entry: "./src/main.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: isDevelopment ? 'js/[name].js' : 'js/[name].[contenthash:8].js',
    publicPath: isDevelopment ? '/' : './',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.pug$/,
        use: [
          {
            loader: 'pug-loader',
            options: {
              pretty: true,
              data: {
                isDevelopment,
                env: {
                  NODE_ENV: process.env.NODE_ENV || 'development'
                }
              }
            }
          }
        ]
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          isDevelopment ? "style-loader" : MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                config: path.resolve(__dirname, 'postcss.config.cjs'),
              },
            },
          },
        ],
      },
      {
        test: /\.(ico|png|svg|webp|jpg|jpeg|gif)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.css', '.pug'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    new MomentLocalesPlugin(),
    new HtmlWebpackPlugin({
      template: './src/templates/index.pug',
      filename: 'index.html',
      inject: true,
      minify: !isDevelopment,
      templateParameters: {
        isDevelopment,
        env: {
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      }
    }),
    ...(isDevelopment ? [] : [new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash:8].css',
    })]),
  ],
};
