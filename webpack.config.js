const webpack = require("webpack");

module.exports = {
    entry: {
        integration: "./src/integration/integration.ts",
        wrapper: "./src/wrapper/wrapper.ts",
        zig: "./src/zig/zig.ts",
    },

    output: {
        filename: './out/[name].min.js',
    },

    resolve: {
        extensions: [".ts"]
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
        })
    ],

    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
            },
            {
                test: /\.css$/,
                use: ['css-loader']
            }
        ]
    }
};
