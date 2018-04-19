const path = require("path");
const webpack = require("webpack");
const DtsBundlePlugin = require('webpack-dts-bundle').default;

module.exports = {
    entry: {
        "libint": "./src/libint.ts",
        "libzig": "./src/libzig.ts",
        "wrapper": "./src/wrapper/wrapper.ts",
        "debug-page": "./src/debug-page/debug-page.tsx",
    },

    output: {
        filename: './[name].js',
        path: path.resolve(__dirname, "dist"),
        libraryTarget: "umd",
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"]
    },

    watchOptions: {
        ignored: /node_modules|dist/,
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
        }),

        ...["libint", "libzig"].map(name => new DtsBundlePlugin({
            name: `zig-js/${name}`,
            main: path.resolve(__dirname, `./dist/typings/${name}.d.ts`),
            out: path.resolve(__dirname, `./dist/${name}.d.ts`),
        }))
    ],

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
            },
            {
                test: /\.css$/,
                loader: 'css-loader',
                options: {
                    minimize: true,
                }
            }
        ]
    }
};
