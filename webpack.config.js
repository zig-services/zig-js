const configs = [
    {prefix: "zig"},
    {prefix: "wrapper"},
    {prefix: "integration"},
];

module.exports = configs.map(config => {
    return {
        entry: `./${config.prefix}/${config.prefix}.ts`,
        output: {
            filename: `out/${config.prefix}.min.js`
        },
        resolve: {
            extensions: [".ts"]
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    loader: "ts-loader",
                    options: {
                        configFile: `${config.prefix}/tsconfig.json`,
                    }
                }
            ]
        }
    }
});