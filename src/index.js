import {echarts, config} from '../assets/js/echarts-callsAnls';
import utils from './utils/utils.js';
import chartEvent from './event/chartEvent.js';
import drawEvent from './event/drawEvent.js';
import eventHandler from "./event/eventHandler";

class RelationGraph {
    constructor(el) {
        this.utils = utils;
        this.forceChart = echarts.init(el);
        // 绑定chartEvent
        for (let ev in chartEvent) {
            this.forceChart.un(config.EVENT[ev], chartEvent[ev]);
            this.forceChart.on(config.EVENT[ev], chartEvent[ev]);
        }

        const _domRoot = this.forceChart._zr.painter._domRoot;
        _domRoot.oncontextmenu = () => false;
        _domRoot.appendChild(utils.rectDom);  // 添加矩形dom，用来框选
    }

    setOption(option) {
        const force = this.forceChart.chart.force;
        const rootData = option.rootData || [],
            data = option.data || [],
            leafData = option.leafData || [];
        utils.option = Object.assign(utils.option, option);
        utils.delStore = [];
        // 若传节点数据，则先清空，再重新setOption
        if (!force || leafData.length || data.length || rootData.length) {
            const size = utils.getLayoutSize(rootData.length + data.length);
            const chartOption = utils.getChartOption(size, [], []);
            // 清空上次的数据
            utils.delStore = [];
            this.forceChart.clear();
            // setOption
            this.forceChart.setOption(chartOption);
            utils.force = this.forceChart.chart.force;
            // 添加数据
            this.addRootNodes(rootData, false);
            this.addNodesLinks(data, false);
            this.addNodesLinks(leafData, true);
            const series = utils.force.series[0];
            series.nodes = utils.formatNodes(series.nodes);
            series.links = utils.formatLinks(series.links);
            utils.force.refresh();

        } else {
            const force = utils.force;
            if (!force) return;
            const series = force.series[0];

            // 更新 nodes 和 links
            if (option.showCritical !== undefined) {
                series.nodes = utils.formatNodes(series.nodes);
            }
            if (option.linkType !== undefined || option.showCritical !== undefined || option.showFirst !== undefined) {
                series.links = utils.formatLinks(series.links);
            }
            force.refresh();
        }
        eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
    }

    /**
     * 添加根节点，若所传的节点在画布中被删除过，则深度删除之前的节点
     * @param rootData
     * @param onlyRootData  是否只添加rootData（不添加data和leafData）
     */
    addRootNodes(rootData, onlyRootData) {
        const force = utils.force;
        if (!force) return;
        const nodes = force.series[0].nodes,
            nameList = nodes.map(d => d.name),
            needDeeplyDel = [];
        utils.delStore = [];
        // 获取根节点(size更大，isRoot为true)
        for (let i = 0, len = rootData.length; i < len; i++) {
            const item = rootData[i];
            if (nameList.indexOf(item.name) !== -1) {
                needDeeplyDel.push(item.name);
            }
            const node = {
                name: item.name,
                type: item.type || item.imageUrl,
                isRoot: true,
                symbolSize: 35,
                relation: []
            };
            node.itemStyle = utils.getNodeStyle(node);
            node.symbol = utils.getNodeImage(node);
            node.z = utils.getNodeZ(node);
            node.isCritical = utils.getNodeCritical(node);
            nodes.push(node);
            nameList.push(node.name);
        }
        needDeeplyDel.length && this.deeplyDelete(needDeeplyDel);
        if (onlyRootData) {
            utils.option.rootData = utils.option.rootData.concat(rootData);
            force.fixed = false;
            force.refresh();
            eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
        }
    }

    /**
     * 添加节点和连线
     * @param data
     * @param isLeafData    是否是LeafData(叶子节点的数据)
     */
    addNodesLinks(data, isLeafData) {
        const force = utils.force;
        if (!force) return;
        const nodes = force.series[0].nodes,
            links = force.series[0].links,
            nameList = nodes.map(d => d.name);
        utils.delStore = [];
        for (let i = 0, len = data.length; i < len; i++) {
            const item = data[i],
                startNode = item.startNode,
                endNode = item.endNode,
                startIndex = nameList.indexOf(startNode.name),
                endIndex = nameList.indexOf(endNode.name);

            if (startIndex !== -1 && endIndex !== -1 && nodes[startIndex].relation.indexOf(endNode.name) !== -1) {
                // 若 startNode 和 endNode 在画布中均已存在，且两点之间已存在连线，则不再添加连线和节点，取消隐藏
                nodes[startIndex].ignore = false;
                nodes[endIndex].ignore = false;
                continue;
            }
            // 添加连线
            links.push({
                source: startNode.name,
                target: endNode.name,
                attr1: item.fLineAttribute && item.fLineAttribute[this.utils.option.linkType] ? item.fLineAttribute : null,
                attr2: item.sLineAttribute && item.sLineAttribute[this.utils.option.linkType] ? item.sLineAttribute : null
            });

            // 添加节点
            if (startIndex === -1) {
                const node = {
                    name: startNode.name,
                    type: startNode.type || startNode.imageUrl,
                    symbolSize: 25,
                    isFolded: !!isLeafData,
                    parentName: isLeafData ? endNode.name : '',
                    relation: [endNode.name]   // 分析关键路径用
                };
                nodes.push(node);
                nameList.push(node.name);
            } else {
                if (isLeafData) {
                    nodes[startIndex].hasLeaf = true;
                }
                nodes[startIndex].relation.push(endNode.name);   // 分析关键路径用
            }
            // 添加节点
            if (endIndex === -1) {
                const node = {
                    name: endNode.name,
                    type: endNode.type || endNode.imageUrl,
                    symbolSize: 25,
                    isFolded: !!isLeafData,
                    parentName: isLeafData ? startNode.name : '',
                    relation: [startNode.name]   // 分析关键路径用
                };
                nodes.push(node);
                nameList.push(node.name);
            } else {
                if (isLeafData) {
                    nodes[endIndex].hasLeaf = true;
                }
                nodes[endIndex].relation.push(startNode.name);   // 分析关键路径用
            }
        }
    }

    /**
     * 给关系图组件绑定自定义事件
     * @param eventType  [事件名]
     * @param cb  [回调函数]
     */
    on(eventType, cb) {
        eventHandler['on' + eventType] = cb;
    }

    /**
     * 删除节点
     * @param nameList [若传，则删除所传的节点；若不传，则删除所有选中的节点]
     * return 是否有删除节点
     */
    deleteNodes(nameList) {
        const force = utils.force;
        if (!force) return;
        const nodes = force._graph.nodes;
        let delList = [];
        if (nameList && nameList instanceof Array) {
            // 若传参数，删除所传节点
            for (let i = 0, l = nodes.length; i < l; i++) {
                const node = nodes[i],
                    data = node.data;
                if (nameList.indexOf(data.name) !== -1) {
                    data.isDeleted = true;
                    data.ignore = true;
                }
            }
            delList = nameList;
        } else {
            // 若无参数，删除已选中的节点
            for (let i = 0, l = nodes.length; i < l; i++) {
                const node = nodes[i],
                    data = node.data;
                if (data.isSelected) {
                    data.isDeleted = true;
                    data.ignore = true;
                    delList.push(data.name);
                }
            }
        }
        utils.deleteRect();
        utils.refresh();
        const singleDel = utils.delSingleNode();     // 节点删除后画布可能会出现孤立节点，一并删除
        delList = [...delList, ...singleDel];
        if (delList.length > 0) {
            if (utils.delStore.length === utils.option.deleteCacheLength) {
                this.deeplyDelete(utils.delStore.shift());
            }
            utils.delStore.push(delList);
            utils.refresh();
            eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
            eventHandler.ondeletenodes(delList);
        }
        return delList;
    }

    /**
     * 恢复上一次删除的节点
     */
    revertLastDel() {
        if (utils.delStore.length === 0) {
            return;
        }
        const lastDel = utils.delStore[utils.delStore.length - 1];
        this.revertDel(lastDel);
        utils.delStore.pop();
    }

    /**
     * 恢复指定的被删除的节点
     * @param nameList {[string]} [指定的nodes名称数组]
     */
    revertDel(nameList) {
        utils.revertDel(nameList);
        utils.refresh();
        eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
        eventHandler.onrevert(nameList);
    }

    /**
     * 深度删除，无法再恢复
     * @param names  [需要深度删除的names，会深度删除其中已经轻度删除过的；若有未轻度删除的，则不会深度删除]
     */
    deeplyDelete(names) {
        const force = utils.force;
        if (!force) return;
        names = names || utils.delStore[0] || [];
        if (!names.length) return;
        const series = force.series[0];
        series.nodes = series.nodes.filter(node => {
            return (!node.isDeleted || names.indexOf(node.name) === -1)
                && (!node.parentName || names.indexOf(node.parentName) === -1)
        });
        series.links = series.links.filter(link => {
            return names.indexOf(link.target) === -1
                && names.indexOf(link.source) === -1
        });
    }

    /**
     * 进行框选，再次执行会取消框选
     */
    drawRect() {
        const force = utils.force;
        if (!force) return;
        const dom = force.zr.painter._domRoot;
        if (utils.isDrawing || force.dragBox) {
            this.deleteRect();
            utils.refresh();
            return;
        }
        utils.isDrawing = true;
        utils.force.zr.handler.isDrawing = true;   // 变换鼠标样式
        utils.setRoam(false, false, true);   // 禁用画布拖动和缩放
        dom.addEventListener('mousedown', drawEvent.mousedown);
    }

    /**
     * 删除画布上的矩形选框
     */
    deleteRect() {
        const force = utils.force;
        if (!force) return;
        const dom = force.zr.painter._domRoot;
        dom.removeEventListener('mousedown', drawEvent.mousedown);
        dom.removeEventListener('mousemove', drawEvent.mousemove);
        dom.removeEventListener('mouseup', drawEvent.mouseup);
        utils.deleteRect();
    }

    /**
     * 标注节点
     */
    markNodes() {
        const force = utils.force;
        if (!force) return;
        const nodes = force.series[0].nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            if (node.isSelected) {
                node.isSelected = false;
                node.isMarked = !node.isMarked;
                node.itemStyle = utils.getNodeStyle(node);  // 取消高亮
                node.symbol = utils.getNodeImage(node);     // 更换图片
            }
        }
        utils.deleteRect();
        utils.refresh();
    }

    /**
     * 搜索节点
     * @param name {string} [需要搜索的节点名称；若传''，则会恢复上一次搜索所改变的节点样式]
     */
    searchNode(name) {
        const force = utils.force;
        if (!force) return;
        const nodes = force.series[0].nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            if (node.isSearched) {      // 上一个被搜索的节点样式还原
                node.isSearched = false;
                node.isSelected = false;
                node.z = utils.getNodeZ(node);
                node.itemStyle = utils.getNodeStyle(node);   // 取消高亮
                node.symbolSize = utils.getNodeSize(node);   // 图片大小恢复
                if (name === '') {
                    break;
                }
            }
            if (node.name === name) {   // 当前被选中的节点变更样式
                node.isSearched = true;
                node.isSelected = true;
                node.z = utils.getNodeZ(node);
                node.itemStyle = utils.getNodeStyle(node);   // 文字高亮
                node.symbolSize = utils.getNodeSize(node);   // 图片放大
                utils.setNodeCenter(name);
            }
        }
        utils.refresh();
    }

    /**
     * 过滤
     * @param fun [过滤函数，需返回true或false； 若不传，则取消所有过滤]
     */
    filter(fun) {
        utils.filter(fun);
        utils.delStore = [];
        eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
    }

    /**
     * 重新布局
     */
    layout() {
        const force = utils.force;
        if (!force) return;
        const series = force.series[0],
            nodes = series.nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            nodes[i].fixed = false;
        }
        force.fixed = false;
        series.center = ['50%', '50%'];     //布局中心点恢复至页面中心
        series.gravity = .8;
        series.size = utils.getLayoutSize(force._layout.graph.nodes.length);
        utils.deleteRect();
        utils.refresh();
    }

    /**
     * 清空画布
     */
    clear() {
        this.forceChart.clear();
        this.forceChart.setOption(utils.getChartOption('100%', [], []));
        utils.force = this.forceChart.chart.force;
        utils.delStore = [];
        utils.isDrawing = false;
        eventHandler.oncountchange([]);
    }

    /**
     * 刷新
     */
    refresh() {
        utils.refresh();
    }

    /**
     * 获取画布对应的img图片
     */
    getPainterImg() {
        const force = this.forceChart.chart.force;
        const layer = force.zr.painter.getLayer(force.zlevel);
        const size = layer.lastSize || [layer.painter._width, layer.painter._height]; // 防止lastSize值丢失
        const src = this.getPainterDataURL();
        return '<img src="' + src + '" width="' + size[0] + '" height="' + size[1] + '" />';
    }

    /**
     * 获取画布base64
     */
    getPainterDataURL() {
        const initTrans = this.utils.setPainterSize();   // 获取完整的节点图片,并记录原始数据
        const url = this.forceChart.getDataURL('png'); // 获取base64码
        this.utils.setPainterSize(initTrans);   // 恢复手动更改之前的painter尺寸及节点位置,以免造成页面卡顿
        return url;
    }

    /**
     * 直接通过 echarts2 的方式 setOption
     */
    setChartOption(option) {
        this.forceChart.setOption(option);
        this.forceChart.refresh({option: option});
        eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
    }

    /**
     * 切换关键路径
     */
    toogleCritical() {
        utils.toggleCritical();
    }
}

const relationGraph = {
    init: element => new RelationGraph(element)
};
window.relationGraph = relationGraph;
export default relationGraph;