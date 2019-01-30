import utils from '../utils/utils.js';
import {Rectangle} from '../../assets/js/echarts-callsAnls';

let rectPos = {};

const drawEvent = {
    mousedown: function(ev) {
        const dom = utils.force.zr.painter._domRoot,
            domPos = dom.getBoundingClientRect();
        const x = ev.clientX - domPos.left,
            y = ev.clientY - domPos.top;
        rectPos = {
            x1: x,
            y1: y,
            x2: x,
            y2: y
        };
        dom.addEventListener('mousemove', drawEvent.mousemove);
        dom.addEventListener('mouseup', drawEvent.mouseup);
    },
    mousemove: function(ev) {
        const dom = utils.force.zr.painter._domRoot,
            domPos = dom.getBoundingClientRect(),
            rectDom = utils.rectDom;
        const x1 = rectPos.x1,
            y1 = rectPos.y1,
            x2 = ev.clientX - domPos.left,
            y2 = ev.clientY - domPos.top;
        const pos = {
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            x2: Math.max(x1, x2),
            y2: Math.max(y1, y2)
        };
        rectPos = pos;
        rectDom.style.width = (pos.x2 - pos.x1) + 'px';
        rectDom.style.height = (pos.y2 - pos.y1) + 'px';
        rectDom.style.top = pos.y1 + 'px';
        rectDom.style.left = pos.x1 + 'px';
    },
    mouseup: function() {
        const force = utils.force,
            dom = force.zr.painter._domRoot,
            nodes = force._graph.nodes,
            layer = force.zr.painter.getLayer(force.zlevel),
            layerPos = layer.position, //坐标系移动
            scale = layer.__zoom || 1;      //坐标系缩放
        const p = {                 //计算经过画布漫游及画布缩放之后的选框范围
            x1: (rectPos.x1 - layerPos[0]) / scale,
            x2: (rectPos.x2 - layerPos[0]) / scale,
            y1: (rectPos.y1 - layerPos[1]) / scale,
            y2: (rectPos.y2 - layerPos[1]) / scale
        };

        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i],
                data = node.data,
                _pos = node.shape.position;
            if (!_pos) continue;
            const x = _pos[0],
                y = _pos[1],
                isNotIn = p.x1 > x || p.x2 < x || p.y1 > y || p.y2 < y;
            data.isSelected = false;
            if (!isNotIn) {
                data.isSelected = true;
                data.dragging = true;   //已修改的force底层代码中，通过dragging属性判断是否移动
            }
            data.itemStyle = utils.getNodeStyle(data);
        }
        force.dragBox = new Rectangle({               //添加矩形shape模拟选框
            style: {
                x: p.x1,
                y: p.y1,
                width: p.x2 - p.x1,
                height: p.y2 - p.y1,
                color: 'rgba(210, 210, 210, 0.4)',
                strokeColor: '#ddd'
            },
            hoverable: false,
            draggable: true,
            z: 999,
            zlevel: 1,
            ondragstart: force.shapeHandler.ondragstart,   //用来触发force的ondragstart事件
            ondragend: force.shapeHandler.ondragend       //用来触发force的ondragend事件
        });
        force.zr.addShape(force.dragBox);
        utils.setRoam(true, true, false);            // 恢复画布拖动和缩放
        utils.refresh();
        dom.removeEventListener('mousedown', drawEvent.mousedown);
        dom.removeEventListener('mousemove', drawEvent.mousemove);
        dom.removeEventListener('mouseup', drawEvent.mouseup);
        dom.addEventListener('dblclick', drawEvent.dblclick);
        utils.isDrawing = false;
        utils.force.zr.handler.isDrawing = false;   // 变换鼠标样式
        utils.rectDom.style.height = '0';
    },
    dblclick: function () {
        const dom = utils.force.zr.painter._domRoot;
        utils.deleteRect();
        utils.refresh();
        dom.removeEventListener('dblclick', drawEvent.dblclick);
    }
};

export default drawEvent;