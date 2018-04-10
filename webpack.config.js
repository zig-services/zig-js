const path = require("path");
const webpack = require("webpack");
const DtsBundlePlugin = require('webpack-dts-bundle').default;

module.exports = {
    entry: {
        "integration": "./src/integration/integration.ts",
        "wrapper": "./src/wrapper/wrapper.ts",
        "zig": "./src/zig/zig.ts",
        "debug-page": "./src/debug-page/debug-page.tsx",
    },

    output: {
        filename: './[name].min.js',
        path: path.resolve(__dirname, "dist/js"),
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"]
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
        }),
        new DtsBundlePlugin({
            name: 'zig',
            main: path.resolve(__dirname, './dist/js/src/integration/integration.d.ts'),
            out: path.resolve(__dirname, './dist/index.d.ts'),
            verbose: true,
        }),
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
