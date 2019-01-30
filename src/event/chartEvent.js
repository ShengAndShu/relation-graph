import utils from '../utils/utils.js';
import eventHandler from "./eventHandler";

const chartEvent = {
    FORCE_LAYOUT_END: function () {
        const nodes = utils.force.series[0].nodes || [];
        if (!nodes.length) return;
        // 停止碰撞算法，设置节点位置固定
        for (let i = 0, len = nodes.length; i < len; i++) {
            let node = nodes[i];
            node.fixed = true;
        }
        utils.force.fixed = true;
        eventHandler.onforcelayout();
        //setNodeCenter
    },
    // 单击
    CLICK: function (param) {
        const data = param.data;
        eventHandler.onclick(param);
        // 单击只针对节点有效，线条单击无效
        if (!data.source && !data.target) {
            const force = utils.force,
                layer = force.zr.painter.getLayer(force.zlevel),
                layerPos = layer.position, //坐标系移动
                scale = layer.__zoom || 1, //坐标系缩放
                eventPos = [param.event.layerX, param.event.layerY],
                pos = [(eventPos[0] - layerPos[0]) / scale, (eventPos[1] - layerPos[1]) / scale],
                nodeR = data.symbolSize; //节点尺寸

            const _eventX = pos[0] - param.position[0],
                _eventY = pos[1] - param.position[1];
            // (x-x1)^2 + (y-y1)^2 <= r^2
            if (data.hasLeaf &&
                Math.pow(_eventX, 2) + Math.pow(_eventY, 2) - Math.pow(2, 1 / 2) * nodeR * (_eventX + _eventY) <= 0 - 6 / 7 * Math.pow(nodeR, 2)) {
                if (data.showLeaf) {
                    //收缩节点
                    utils.toggleLeaf(data.name, true);
                    utils.refresh();
                } else {
                    //展开节点
                    const series = force.series[0],
                        center = series.center,
                        gravity = series.gravity;
                    utils.toggleLeaf(data.name, false);
                    if (utils.filterFun) {
                        utils.filter(utils.filterFun);
                    } else {
                        utils.refresh();
                    }
                    eventHandler.onshowleaf();
                    series.center = center;   // 恢复簇状布局的影响
                    series.gravity = gravity;   // 恢复簇状布局的影响
                }
                eventHandler.oncountchange(utils.force._graph.nodes.map(d => d.id));
            } else {
                // 节点高亮
                data.isSelected = !data.isSelected;
                data.itemStyle = utils.getNodeStyle(data);
                utils.refresh();
            }
        }
    },
    // 右键菜单
    CONTEXTMENU: function (param) {
        eventHandler.oncontextmenu(param);
    }
};
export default chartEvent;