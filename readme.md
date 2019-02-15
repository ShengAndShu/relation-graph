业务线中有多个项目用到了关系图，而echarts中的关系图并不能满足业务需求，需要开发共用的关系图组件以提升项目开发效率。

relationGaph.js是一套基于echarts2开发的关系图组件，本组件与echarts2关系图相比：

 增加了更多的交互功能和样式，且所有功能和样式均可自定义配置；

 优化了大数据量时的canvas性能，交互体验更流畅；


初始化：
===
npm run build打包生成 relationGraph.js，在页面引入该js，拷贝图片到项目中。初始化方式如下：

```
const graph = relationGraph.init('domId’');  // 容器dom id
const option = {
    imageUrl: '/assets/images/'
};
graph.setOption(option);
```

option配置项：
===
```
const option = {
    imageUrl: '/assets/images/graph/',
    showFirst: true,
    showSecond: true,
    showCritical: false,
    deleteCacheLength: 1,
    linkType: 'mc',     // 'mc': 时长，'num': 频次
    data: [],
    leafData: [],
    rootData: [],

};
```

* `imageUrl` | string | 图片路径

    默认值：''

* `deleteCacheLength` | number | 缓存的删除次数（即可以撤销多少次删除）

    默认值：1

* `showFirst` | boolean | 连线上是否展示第一时间区间数据

    默认值：true

* `showSecond` | boolean | 连线上是否展示第二时间区间数据

    默认值：true

* `showCritical` | boolean | 是否展示关键路径

    默认值：false

* `linkType` | string | 连线展示的数据类型,与后台数据的字段相同

    默认值：'mc'，可选'num'

* `data` | [object] | 直接展示的节点数据,数据格式与G13后台数据格式相同，具体可见详设文档

    默认值：'mc'，可选'num'

* `leafData` | [object] | 叶子节点数据,数据格式与G13后台数据格式相同，具体可见详设文档

    默认值：'mc'，可选'num'

* `rootData` | [{type: string, name: string}] | 根节点数据

    默认值：'mc'，可选'num'

API:
===

* `deleteNodes(nameList: [string])`: 清除指定的节点；若不传参数，则清除所有选中的节点

* `revertLastDel()`: 恢复上一次删除的节点

* `revertDel(nameList: [string])`: 恢复指定的节点

* `drawRect()`: 开始框选

* `deleteRect()`: 清除选框

* `markNodes()`: 标记所有选中的节点

* `searchNode(name: string)`: 搜索节点

* `filter(filterFun: function)`: 过滤掉不满足filterFun的连线

* `layout()`: 重新布局

* `clear()`: 清空画布

* `refresh()`: 刷新画布

* `getPainterDataURL()`: 获取画布base64（包括超出画布范围的节点）

* `getPainterImg()`: 获取画布对应的image元素（包括超出画布范围的节点）

* `utils.toggleLeaf(name: string, needFold: boolean)`: 展开/收缩指定节点下的叶子节点

* `utils.setNodesFixed()`: 设置所有节点取消自动布局