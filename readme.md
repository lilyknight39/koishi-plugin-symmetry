# koishi-plugin-symmetry

[![npm](https://img.shields.io/npm/v/koishi-plugin-symmetry?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-symmetry)

生成对称图，支持 GIF 动图与常见图片格式。

## 使用

- `symmetry [image]`
- `symmetry -d left|right|up|down|both [image]`

方向说明：
- `left`：以左半边为基准，镜像到右侧
- `right`：以右半边为基准，镜像到左侧
- `up`：以上半边为基准，镜像到下侧
- `down`：以下半边为基准，镜像到上侧
- `both`：以左上角为基准，四向对称
