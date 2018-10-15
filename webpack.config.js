const path = require("path");
const webpack = require("webpack");

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
        library: "ZIG",
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: {
            'vue$': 'vue/dist/vue.esm.js'
        }
    },

    watchOptions: {
        ignored: /node_modules|dist/,
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
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
