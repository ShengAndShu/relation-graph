const rectDom = document.createElement('div');
rectDom.id = "graphDraw";
rectDom.style.position = 'absolute';
rectDom.style.backgroundColor = 'rgba(210,210,210,0.4)';
rectDom.style.cursor = 'move';

const utils = {
    force: null,
    rectDom: rectDom,    // 框选用的dom
    delStore: [],        // 保存删除的节点
    filterStore: [],     // 保存过滤的连线
    filterFun: null,     // 过滤用的函数
    isDrawing: false,    // 当前是否正在框选或者画布上存在选框
    option: {
        imageUrl: '',
        deleteCacheLength: 1,  // 缓存删除的次数
        data: [],              // 直接展示的节点数据
        rootData: [],          // 根节点数据
        leafData: [],          // 叶子节点数据
        criticalData: [],      // 关键路径数据
        contextDom: null,      // 右键用的dom
        clusterLayout: true,   // 是否启用簇状布局
        showFirst: true,       // 连线上是否展示第一时间区间数据
        showSecond: true,      // 连线上是否展示第二时间区间数据
        showCritical: false,   // 是否展示关键路径
        linkType: 'mc',        // 连线展示的数据类型
        nodeTextColHigh: '#f05856',    //节点文字高亮颜色
        nodeTextColNorm: '#000',       //字体颜色
        nodeTextColDark: '#EAEAEA',    //置灰的文字颜色
        linkTextColFirst: '#000',      //第一个时间区间的连线文字颜色
        linkTextColSec: '#6495ED',     //第二个时间区间的连线文字颜色
        linkTextColDark: '#D3D3D3',    //置灰线条的文字颜色
        linkColFirst: '#666',          //第一个时间区间的连线颜色
        linkColSec: '#87CEFA',         //第二个时间区间的连线颜色
        linkColDark: '#EAEAEA',        //置灰的线条颜色
    },
    getChartOption: function (size, nodes, links) {
        return {
            tooltip: {
                show: false
            },
            toolbox: {
                show: false
            },
            series: [{
                type: 'force',
                ribbonType: false,
                itemStyle: {
                    normal: {
                        label: {
                            show: true,
                            position: 'bottom',
                            textStyle: {
                                color: '#333'
                            }
                        },
                        nodeStyle: {
                            brushType: 'both',
                            borderColor: 'rgba(255,215,0,0.4)',
                            borderWidth: 0
                        },
                        linkStyle: {
                            type: 'line'
                        }
                    },
                    emphasis: {
                        label: {
                            show: false
                        },
                        nodeStyle: {},
                        linkStyle: {}
                    }
                },
                useWorker: true,
                minRadius: 15,
                maxRadius: 30,
                gravity: .8,
                ratioScaling: true,
                large: true,
                scaling: 1.5,
                roam: true,
                size: size,
                nodes: nodes,
                links: links
            }]
        }
    },

    /**
     * 获取格式化后的nodes
     * @param nodes
     * @returns {*}
     */
    formatNodes: function (nodes) {
        for (let i = 0, len = nodes.length; i < len; i++) {
            const node = nodes[i];
            node.isCritical = utils.getNodeCritical(node);
            node.ignore = utils.getNodeIgnore(node);
            node.itemStyle = utils.getNodeStyle(node);
            node.symbol = utils.getNodeImage(node);
            node.z = utils.getNodeZ(node);
        }
        return nodes;
    },

    /**
     * 获取格式化后的links
     * @param links
     * @returns {*}
     */
    formatLinks: function (links) {
        for (let i = 0, len = links.length; i < len; i++) {
            const link = links[i];
            link.isCritical = utils.getLinkCritical(link);
            link.itemStyle = utils.getLinkStyle(link);
            link.z = utils.getLinkZ(link);
        }
        return links;
    },

    /**
     * 刷新，并更新utils中保存的 nodes 和 links
     */
    refresh: function () {
        const force = utils.force;
        if (!force) return;
        force.refresh();
    },

    /**
     * 获取指定node的文字样式
     * @param node
     * @returns {{}}
     */
    getNodeStyle: function (node) {
        const option = utils.option;
        const color = (option.showCritical && !node.isCritical) ? option.nodeTextColDark
            : node.isRoot ? option.nodeTextColHigh : option.nodeTextColNorm;
        return {
            normal: {
                label: {
                    textStyle: {
                        color: color,
                        fontWeight: node.isSelected ? 900 : 400,
                        fontSize: 12
                    }
                }
            }
        }
    },
    /**
     * 获取指定node的图片
     * @param node
     * @returns {string}
     */
    getNodeImage: function (node) {
        let imgType = node.type;
        if (utils.option.showCritical && !node.isCritical) {
            imgType += '-dark';
        }
        if (node.isMarked) {
            imgType += '-marked';
        }
        if (node.hasLeaf) {
            imgType += node.showLeaf ? '-minus' : '-plus';
        }
        return 'image://' + utils.option.imageUrl + imgType + '.png';
    },
    /**
     * 获取指定node是否需要隐藏
     * @param node
     * @returns {boolean}
     */
    getNodeIgnore: function (node) {
        return node.isFolded || node.isDeleted || node.isFilterOut;
    },
    /**
     * 获取指定node的图片大小
     * @param node
     * @returns {number}
     */
    getNodeSize: function (node) {
        return (node.isRoot || node.isSearched) ? 36 : 22;
    },
    /**
     * 获取指定node的z (层叠属性)
     * @param node
     * @returns {number}
     */
    getNodeZ: function (node) {
        let z = 50;
        if (node.isRoot) {
            z = 60;
        }
        if (utils.option.showCritical && node.isCritical) {
            z = 70;
        }
        if (node.isSearched) {
            z = 80;
        }
        return z;
    },
    /**
     * 获取指定node的isCritical (是否属于关键路径，需要从后台获取criticalData)
     * @param node
     * @returns {boolean}
     */
    getNodeCritical: function (node) {
        const criticalData = utils.option.criticalData;
        return criticalData.length && (criticalData.indexOf(node.name) !== -1);
    },
    /**
     * 获取指定link的z (层叠属性)
     * @param link
     * @returns {number}
     */
    getLinkZ: function (link) {
        return utils.option.showCritical && link.isCritical ? 61 : 1;
    },
    /**
     * 获取指定link的isCritical (是否属于关键路径)
     * @param link
     * @returns {boolean}
     */
    getLinkCritical: function (link) {
        const criticalData = utils.option.criticalData;
        return criticalData.length && (criticalData.indexOf(link.source) !== -1)
            && (criticalData.indexOf(link.target) !== -1);
    },
    /**
     * 获取指定link的样式
     * @param link
     * @returns {{}}
     */
    getLinkStyle: function (link) {
        const option = utils.option,
            linkType = option.linkType,
            showFirst = option.showFirst && link.attr1,
            showSecond = option.showSecond && link.attr2,
            linkDark = option.showCritical && !link.isCritical;
        const color = linkDark ? option.linkColDark : (showSecond ? option.linkColSec : option.linkColFirst);
        const textColor = linkDark ? option.linkColDark : (showSecond ? (showFirst ? [option.linkTextColFirst, option.linkTextColSec] : option.linkTextColSec) : option.linkTextColFirst);
        let text = '';
        if (showSecond) {
            text = link.attr2[linkType];
        }
        if (showFirst) {
            text = text ? [link.attr1[linkType], '(' + link.attr2[linkType] + ')'] : link.attr1[linkType];
        }
        return {
            normal: {
                lineWidth: 1,
                text: text,
                color: color,
                textColor: textColor,
                fontSize: '16px',
                textPosition: 'inside'
            }
        }
    },

    /**
     * 根据显示的节点的数量估计布局大小
     * @param  {number}  num [画布中展示的节点数量；不传的话则自动计算]
     * @return {string}  size     [布局所需放大比例]
     */
    getLayoutSize: function (num) {
        const force = utils.force;
        if (!force) return '100%';
        const len = num ? num : force._layout.graph.nodes.length;
        return len > 100 ? Math.round(Math.pow(Math.max(1, len / 10), 1 / 2)) + '00%' : '100%';
    },

    /**
     * 平移画布，使指定节点居中
     * @param  {string}  nodeName [需居中的节点名称]
     */
    setNodeCenter: function (nodeName) {
        const force = utils.force;
        if (!force) return;
        let pos;
        const nodes = utils.force._layout.graph.nodes,
            layer = force.zr.painter.getLayer(force.zlevel);
        for (let i = 0, len = nodes.length; i < len; i++) {
            const node = nodes[i];
            if (node.id === nodeName) {
                pos = node.layout.position; //找出改节点的坐标信息
                break;
            }
        }
        if (pos.length === 2) { //若不出意外地找到该节点信息
            const center = [], //[xAxis, yAxis]计算经过画布缩放漫游之后的画布中心
                _zoom = layer.__zoom || 1; //画布缩放比例
            center[0] = (layer.painter._width / 2) / _zoom; //横向居中
            center[1] = (layer.painter._height / 3) / _zoom; //纵向1/3处

            // 移动画布使搜索目标居中显示
            layer.position[0] = ((center[0] - pos[0]) * _zoom);
            layer.position[1] = ((center[1] - pos[1]) * _zoom);
        }
    },

    /**
     * 设置画布是否开启拖拽和缩放
     * @param canRoam {boolean} [是否可以拖拽画布]
     * @param canDrag {boolean} [是否可以缩放画布]
     * @param needRefresh {boolean} [是否刷新画布，默认刷新]
     */
    setRoam: function (canRoam, canDrag, needRefresh) {
        const series = utils.force.series[0];
        series.roam = canRoam || false;
        series.draggable = canDrag || false;
        if (needRefresh === undefined || needRefresh === true) {
            utils.refresh();
        }
    },

    /**
     * 删除画布上的矩形选框
     */
    deleteRect: function () {
        const force = utils.force,
            nodes = force.series[0].nodes;
        utils.isDrawing = false;
        utils.rectDom.style.height = '0';
        utils.force.zr.handler.isDrawing = false;   // 变换鼠标样式
        if (!force.dragBox) {
            return;
        }
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            node.isSelected = false;
            node.dragging = false;
            node.itemStyle = utils.getNodeStyle(node);   // 取消高亮
        }
        force.zr.storage._multiTargets = [];
        force.zr.delShape(force.dragBox.id);
        force.dragBox = null;
    },
    /**
     * 展开（收缩）叶子节点
     * @param name  {string}  [节点name]
     * @param needFold  {boolean}  [true: 收缩节点，false: 展开节点]
     */
    toggleLeaf: function (name, needFold) {
        const nodes = utils.force.series[0].nodes;
        let leafLen = 0;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            if (node.parentName === name) {
                leafLen++;
                node.isFolded = needFold;
                node.fixed = needFold;
                utils.force.fixed = needFold;
                // node.isSelected = false;
                // node.isMarked = false;
                node.ignore = utils.getNodeIgnore(node);
            } else if (node.name === name) {
                node.showLeaf = !needFold;
                node.symbol = utils.getNodeImage(node);
            }
        }
        if (!needFold && utils.option.clusterLayout) {
            utils.setClusterPre(name, leafLen);
        }
    },
    /**
     * 根据待扩展节点周围节点分布的稀疏分布程度 及其叶子节点数量，在画布中形成"簇"的分布
     * @param  {String}  name   [待拓展节点的名称]
     * @param  {number}  leafLen   [待拓展节点的叶子节点数量]
     */
    setClusterPre: function (name, leafLen) {
        const force = utils.force;
        if (!force) return;
        const layoutNodes = force._graph.nodes,
            pos = force._graph._nodesMap[name] && force._graph._nodesMap[name].layout.position;
        if (!pos) return;
        const _layout = force._layout,
            posX = pos[0], posY = pos[1], //待扩展节点的坐标
            sizeRatio = force.series[0].size.replace(/[^0-9]/ig, "") / 100, // size放大倍数
            layoutW = _layout.width / sizeRatio, layoutH = _layout.height / sizeRatio,
            rPowTwo = layoutW * layoutW / 4 + layoutH * layoutH / 4, //画布对角线的一半的平方
            angleArr = [];
        // 恢复至默认数值
        force.series[0].center = ['50%', '50%'];
        force.series[0].gravity = .8;

        for (let i = 0, l = layoutNodes.length; i < l; i++) {
            const node = layoutNodes[i];
            if (node.id === name) continue; // 该节点本身除外
            const itemPos = node.layout.position,
                deltaX = itemPos[0] - posX,
                deltaY = posY - itemPos[1]; //y轴正方向向下
            if ((deltaX * deltaX + deltaY * deltaY) > rPowTwo) continue; // 指定半径范围
            let angle = Math.atan2(deltaY, deltaX);
            if (angle < 0) angle += 2 * Math.PI; //(-PI, PI] ===> [0, 2*PI)
            angleArr.push(angle);
        }
        angleArr.sort();

        // 比较相邻角度之间相差最大的一组
        const maxAngle = [0, 0]; //[用于比较的差值, 平均数]
        for (let i = 0, l = angleArr.length - 1; i < l; i++) {
            const delta = angleArr[i + 1] - angleArr[i];
            if (delta > maxAngle[0]) {
                maxAngle[0] = delta;
                maxAngle[1] = (angleArr[i + 1] + angleArr[i]) / 2;
            }
        }
        const firstAngle = angleArr[0] + 2 * Math.PI,
            lastAngle = angleArr[angleArr.length - 1]; //考虑最小和最大的角度之间的夹角，并存在2 * PI 的差
        if (firstAngle - lastAngle > maxAngle[0]) {
            maxAngle[0] = firstAngle - lastAngle;
            maxAngle[1] = (firstAngle + lastAngle) / 2;
            if (maxAngle[1] > 2 * Math.PI) maxAngle[1] -= 2 * Math.PI;
        }
        if (maxAngle[0] > 1) { //角度范围的最小值
            const theta = maxAngle[1], //模拟中心的方向角度
                r = Math.sqrt(rPowTwo) / 1.5, //模拟中心与目标节点的距离(可优化)
                // fakeX = Math.max(Math.cos(theta) * r + posX, 0),
                // fakeY = Math.max(posY - Math.sin(theta) * r, 0); //模拟中心点的坐标, 不可<0
                fakeX = Math.cos(theta) * r + posX,
                fakeY = posY - Math.sin(theta) * r;
            // 设置画布属性
            force.series[0].center = [fakeX / layoutW * 100 + '%', fakeY / layoutH * 100 + '%']; //center的计算与size有关,与scaling无关
            force.series[0].gravity = leafLen > 100 ? Math.floor(Math.pow(leafLen, 3 / 4)) + 15 : leafLen * .0007 + .8; //根据节点数量调整向心力大小
            force.series[0].size = utils.getLayoutSize(layoutNodes.length + leafLen);
        }
    },

    /**
     * 设置节点位置固定（不会自动布局）
     */
    setNodesFixed: function () {
        const force = utils.force;
        if (!force) return;
        const nodes = force.series[0].nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            nodes[i].fixed = true;
        }
    },

    /**
     * 删除画布上的孤立节点（不包括根节点）
     * @returns {Array}
     */
    delSingleNode: function () {
        const names = [];
        const nodes = utils.force._graph.nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i],
                data = node.data,
                edges = node.edges;
            if (!data.isRoot && (!edges || edges.length === 0)) {
                data.isDeleted = true;
                data.ignore = true;
                names.push(data.name);
            }
        }
        return names;
    },

    /**
     * 恢复指定的被删除的节点
     * @param names {[string]} [指定的nodes名称数组]
     */
    revertDel: function (names) {
        const force = utils.force,
            rootNames = utils.option.rootData.map(d => d.name);
        if (!force || !names || !names.length) return;
        const nodes = utils.force.series[0].nodes;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            if (node.isDeleted && names.indexOf(node.name) !== -1) {
                node.isDeleted = false;
                node.isRoot = rootNames.indexOf(node.name) !== -1;
                node.ignore = utils.getNodeIgnore(node);
            }
            node.isSelected = false;
            node.itemStyle = utils.getNodeStyle(node);
            node.symbolSize = utils.getNodeSize(node);
        }
    },

    /**
     * 过滤。 isFilterOut 为 false 过滤通过； true 过滤未通过；
     * @param fun [过滤函数，需返回true或false； 若不传，则取消所有过滤]
     */
    filter(fun) {
        const force = utils.force;
        if (!force) return;
        const series = force.series[0],
            nodes = series.nodes;
        // 将所有节点重置，并刷新，方便后面能获取完整的_grah.edges（否则之前被过滤掉的本次无法在_graph.edges中获取到）
        for (let i = 0, l = nodes.length; i < l; i++) {
            const node = nodes[i];
            node.isFilterOut = undefined;
            node.ignore = utils.getNodeIgnore(node);
        }
        // 将所有已过滤的连线重置
        series.links = [...series.links, ...utils.filterStore];
        utils.filterFun = fun;
        utils.filterStore = [];
        utils.refresh();
        // 进行过滤
        if (fun) {
            const filterStore = utils.filterStore;
            const edges = force._graph.edges;
            for (let i = 0, l = edges.length; i < l; i++) {
                const edge = edges[i],
                    node1 = edge.node1.data,
                    node2 = edge.node2.data;
                const isFilterOut = !fun(edge.data);
                // 过滤节点
                // 一个节点可能有多个连线，只要有一个连线的isFilterOut为false，该节点的isFilterOut就为false
                node1.isFilterOut = (node1.isFilterOut === undefined) ? isFilterOut : (node1.isFilterOut && isFilterOut);
                node2.isFilterOut = (node2.isFilterOut === undefined) ? isFilterOut : (node2.isFilterOut && isFilterOut);
                node1.ignore = utils.getNodeIgnore(node1);
                node2.ignore = utils.getNodeIgnore(node2);
                if (isFilterOut) {
                    filterStore.push(edge.data);
                }
            }
            // 过滤连线
            series.links = series.links.filter(link => filterStore.indexOf(link) === -1);
            utils.refresh();
        }
    },

    /**
     * 改变画布大小，使之能展示所有节点
     */
    setPainterSize(transInfo) {
        let _hasTar = !!transInfo, //是否改变至指定尺寸及位置
            _trans = transInfo || {},
            _initTrans = {}, //未指定transInfo时返回原始数据
            _force = utils.force,
            _zlevel = _force.zlevel,
            _layer = _force.zr.painter.getLayer(_zlevel),
            _shapeList = _force.zr.painter.storage._shapeList;
        // 未传入指定size值时,默认更改为能够覆盖所有节点的最小画布尺寸
        if (!_hasTar) {
            const _range = {
                x: [Infinity, -Infinity], //[min, max]
                y: [Infinity, -Infinity]
            };
            // 遍历所有节点的坐标信息,计算出目标尺寸及位移距离
            for (let i = 0, l = _shapeList.length; i < l; i++) {
                const d = _shapeList[i];
                if (d.zlevel == _zlevel && d.style.image) {
                    _range.x[0] = Math.min(_range.x[0], d.position[0]);
                    _range.x[1] = Math.max(_range.x[1], d.position[0]);
                    _range.y[0] = Math.min(_range.y[0], d.position[1]);
                    _range.y[1] = Math.max(_range.y[1], d.position[1]);
                }
            }
            const _size = _layer.lastSize || [_layer.painter._width, _layer.painter._height]; //布局时的尺寸大小也参与比较
            _trans = layoutRegression(_range, 35, _size, _layer.painter);
            // 计算获取完整图片所需的画布移动及缩放倍数
            function layoutRegression(range, r, size, painter) {
                let x = range.x,
                    y = range.y, //[min, max]
                    pos = [(r * 4 > x[0]) * (r * 4 - x[0]), (r * 2 > y[0]) * (r * 4 - y[0])], //[xAxis, yAxis]
                    scale = Math.max.apply(null, [1, //取>1的最大放大系数,避免不按比例拉伸造成图片变形
                        (x[1] - (pos[0] != 0) * x[0] + 6 * r) / size[0],
                        (y[1] - (pos[1] != 0) * y[0] + 6 * r) / size[1]
                    ]);

                if (scale > 10) scale += Math.pow(((scale - 1) * 10), 1 / 4) - 1; //该拟合函数用于中和eCharts中心点的计算偏差
                return {
                    pos: pos,
                    zoom: [scale * size[0] / painter._width, scale * size[1] / painter._height]
                };
            }
            _initTrans.zoom = [1 / _trans.zoom[0], 1 / _trans.zoom[1]]; //取倒数用于再次恢复
            _initTrans.pos = [0 - _trans.pos[0], 0 - _trans.pos[1]]; //取相反数用于再次恢复
        }
        // _trans.pos != [0, 0]时改变节点位置
        if (_trans.pos[0] != 0 || _trans.pos[1] != 0) {
            for (var i = 0, l = _shapeList.length; i < l; i++) {
                var d = _shapeList[i];
                if (d.zlevel == _zlevel) {
                    d.position[0] += _trans.pos[0];
                    d.position[1] += _trans.pos[1];
                }
            }
        }
        // 改变painter尺寸
        _layer.painter._width *= _trans.zoom[0];
        _layer.painter._height *= _trans.zoom[1];
        if (!_hasTar) return _initTrans;
    },

    /**
     * 获取echarts2的配置项（包含节点的位置数据）
     * @returns echart2配置项
     */
    getChartOptionWithPos() {
        const option = this.force.option;
        const nodes = option.series[0].nodes,
            nodesMap = this.force._layout.graph._nodesMap;
        for (let i = 0, l = nodes.length; i < l; i++) {
            const item = nodesMap[nodes[i].name];
            if (!item) continue; //防止节点位置信息异常时报错
            const _layout = item.layout;
            nodes[i].initial = [_layout.position[0], _layout.position[1]];
        }
        return option;
    },

    /**
     * 获取画布上展示的根节点
     */
    getRootNodes() {
        const layoutNodes = this.force._graph.nodes;
        return layoutNodes.filter(node => node.data.isRoot).map(node => node.data);
    },

    /**
     * 切换关键路径(在前端计算关键路径，性能不明)
     */
    toggleCritical() {
        let criticalData = [];
        let cache = [];
        const store = {};
        const roots = this.getRootNodes().map(node => node.name);
        const layoutNodes = this.force._graph.nodes;
        const series = this.force.series[0];

        this.option.showCritical = !this.option.showCritical;
        // 隐藏关键路径
        if (!this.option.showCritical) {
            series.nodes = utils.formatNodes(series.nodes);
            series.links = utils.formatLinks(series.links);
            this.force.refresh();
            return;
        }
        // 获取画布上展示的节点的关系数据(不包括叶子节点)
        for (let i = 0, l = layoutNodes.length; i < l; i++) {
            const node = layoutNodes[i];
            if (!node.data.ignore && !node.data.parentName) {
                store[node.id] = node.data.relation;
            }
        }
        // 每两个rootNode之间计算是否存在关键路径
        for (let i = 0, l = roots.length; i < l - 1; i++) {
            const start = roots[i];
            for (let j = i + 1; j < l; j++) {
                cache = [start];
                const result = this.getPath(start, roots[j], cache, store);
                if (result && cache.length > 2) {
                    criticalData = criticalData.concat(cache);
                }
            }
        }
        this.option.criticalData = criticalData;
        series.nodes = utils.formatNodes(series.nodes);
        series.links = utils.formatLinks(series.links);
        this.force.refresh();
    },

    /**
     * 判断两个 rootNode 之间是否有关键路径(在前端计算关键路径，性能不明)
     * @param start
     * @param end
     * @param cache  缓存路径上经过的每个节点
     * @param store  节点关系的数据（不包含叶子节点）
     * @returns {boolean}
     */
    getPath(start, end, cache, store) {
        const relations = store[start];                  // 开始节点的所有有关联节点
        if  (!relations) {
            return false;
        }
        for (let i = 0, l = relations.length; i < l; i++) {
            const relation = relations[i];
            if (cache.indexOf(relation) !== -1) {        // 该点已经判断过，继续判断下一个点
                continue;
            }
            cache.push(relation);                        // 把该点记录到缓存中
            if (relation === end) {                      // 找到结束节点
                return true;
            } else if (this.getPath(relation, end, cache, store)) {       // 从该点开始，继续向下层判断
                return true;
            } else {
                cache.pop();                             // 找到底层也没有找到结束节点，从cache中删除该点
            }
        }
        return false;
    }
};

export default utils;