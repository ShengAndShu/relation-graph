
var require, define;
(function () {
    var mods = {};

    define = function (id, deps, factory) {
        mods[id] = {
            id: id,
            deps: deps,
            factory: factory,
            defined: 0,
            exports: {},
            require: createRequire(id)
        };
    };

    require = createRequire('');

    function normalize(id, baseId) {
        if (!baseId) {
            return id;
        }

        if (id.indexOf('.') === 0) {
            var basePath = baseId.split('/');
            var namePath = id.split('/');
            var baseLen = basePath.length - 1;
            var nameLen = namePath.length;
            var cutBaseTerms = 0;
            var cutNameTerms = 0;

            pathLoop: for (var i = 0; i < nameLen; i++) {
                switch (namePath[i]) {
                    case '..':
                        if (cutBaseTerms < baseLen) {
                            cutBaseTerms++;
                            cutNameTerms++;
                        }
                        else {
                            break pathLoop;
                        }
                        break;
                    case '.':
                        cutNameTerms++;
                        break;
                    default:
                        break pathLoop;
                }
            }

            basePath.length = baseLen - cutBaseTerms;
            namePath = namePath.slice(cutNameTerms);

            return basePath.concat(namePath).join('/');
        }

        return id;
    }

    function createRequire(baseId) {
        var cacheMods = {};

        function localRequire(id, callback) {
            if (typeof id === 'string') {
                var exports = cacheMods[id];
                if (!exports) {
                    exports = getModExports(normalize(id, baseId));
                    cacheMods[id] = exports;
                }

                return exports;
            }
            else if (id instanceof Array) {
                callback = callback || function () {};
                callback.apply(this, getModsExports(id, callback, baseId));
            }
        };

        return localRequire;
    }

    function getModsExports(ids, factory, baseId) {
        var es = [];
        var mod = mods[baseId];

        for (var i = 0, l = Math.min(ids.length, factory.length); i < l; i++) {
            var id = normalize(ids[i], baseId);
            var arg;
            switch (id) {
                case 'require':
                    arg = (mod && mod.require) || require;
                    break;
                case 'exports':
                    arg = mod.exports;
                    break;
                case 'module':
                    arg = mod;
                    break;
                default:
                    arg = getModExports(id);
            }
            es.push(arg);
        }

        return es;
    }

    function getModExports(id) {
        var mod = mods[id];
        if (!mod) {
            throw new Error('No ' + id);
        }

        if (!mod.defined) {
            var factory = mod.factory;
            var factoryReturn = factory.apply(
                this,
                getModsExports(mod.deps || [], factory, id)
            );
            if (typeof factoryReturn !== 'undefined') {
                mod.exports = factoryReturn;
            }
            mod.defined = 1;
        }

        return mod.exports;
    }
}());
define('echarts', ['echarts/echarts'], function (main) {return main;});
define('echarts/echarts', [
    'require',
    './config',
    'zrender/tool/util',
    'zrender/tool/event',
    'zrender/tool/env',
    'zrender',
    'zrender/config',
    './chart/island',
    './component',
    './component/title',
    './component/tooltip',
    './component/legend',
    './util/ecData',
    './chart',
    'zrender/tool/color',
    'zrender/shape/Image',
    'zrender/loadingEffect/Bar'
], function (require) {
    var ecConfig = require('./config');
    var zrUtil = require('zrender/tool/util');
    var zrEvent = require('zrender/tool/event');
    var self = {};
    var _canvasSupported = require('zrender/tool/env').canvasSupported;
    var _idBase = new Date() - 0;
    var _instances = {};
    var DOM_ATTRIBUTE_KEY = '_echarts_instance_';
    self.version = '2.2.2';
    self.dependencies = { zrender: '2.0.8' };
    self.init = function (dom, theme) {
        var zrender = require('zrender');
        if (zrender.version.replace('.', '') - 0 < self.dependencies.zrender.replace('.', '') - 0) {
            console.error('ZRender ' + zrender.version + ' is too old for ECharts ' + self.version + '. Current version need ZRender ' + self.dependencies.zrender + '+');
        }
        dom = dom instanceof Array ? dom[0] : dom;
        var key = dom.getAttribute(DOM_ATTRIBUTE_KEY);
        if (!key) {
            key = _idBase++;
            dom.setAttribute(DOM_ATTRIBUTE_KEY, key);
        }
        if (_instances[key]) {
            _instances[key].dispose();
        }
        _instances[key] = new Echarts(dom);
        _instances[key].id = key;
        _instances[key].canvasSupported = _canvasSupported;
        _instances[key].setTheme(theme);
        return _instances[key];
    };
    self.getInstanceById = function (key) {
        return _instances[key];
    };
    function MessageCenter() {
        zrEvent.Dispatcher.call(this);
    }
    zrUtil.merge(MessageCenter.prototype, zrEvent.Dispatcher.prototype, true);
    function Echarts(dom) {
        dom.innerHTML = '';
        this._themeConfig = {};
        this.dom = dom;
        this._connected = false;
        this._status = {
            dragIn: false,
            dragOut: false,
            needRefresh: false
        };
        this._curEventType = false;
        this._chartList = [];
        this._messageCenter = new MessageCenter();
        this._messageCenterOutSide = new MessageCenter();
        this.resize = this.resize();
        this._init();
    }
    var ZR_EVENT = require('zrender/config').EVENT;
    var ZR_EVENT_LISTENS = [
        'CLICK',
        'DBLCLICK',
        'CONTEXTMENU',
        'MOUSEOVER',
        'MOUSEOUT',
        'DRAGSTART',
        'DRAGEND',
        'DRAGENTER',
        'DRAGOVER',
        'DRAGLEAVE',
        'DROP'
    ];
    function callChartListMethodReverse(ecInstance, methodName, arg0, arg1, arg2) {
        var chartList = ecInstance._chartList;
        var len = chartList.length;
        while (len--) {
            var chart = chartList[len];
            if (typeof chart[methodName] === 'function') {
                chart[methodName](arg0, arg1, arg2);
            }
        }
    }
    Echarts.prototype = {
        _init: function () {
            var self = this;
            var _zr = require('zrender').init(this.dom);
            this._zr = _zr;
            this._messageCenter.dispatch = function (type, event, eventPackage, that) {
                eventPackage = eventPackage || {};
                eventPackage.type = type;
                eventPackage.event = event;
                self._messageCenter.dispatchWithContext(type, eventPackage, that);
                if (type != 'HOVER' && type != 'MOUSEOUT') {
                    setTimeout(function () {
                        self._messageCenterOutSide.dispatchWithContext(type, eventPackage, that);
                    }, 50);
                } else {
                    self._messageCenterOutSide.dispatchWithContext(type, eventPackage, that);
                }
            };
            this._onevent = function (param) {
                return self.__onevent(param);
            };
            for (var e in ecConfig.EVENT) {
                if (e != 'CLICK' && e != 'DBLCLICK' && e != 'HOVER' && e != 'MOUSEOUT' && e != 'MAP_ROAM') {
                    this._messageCenter.bind(ecConfig.EVENT[e], this._onevent, this);
                }
            }
            var eventBehaviors = {};
            this._onzrevent = function (param) {
                return self[eventBehaviors[param.type]](param);
            };
            for (var i = 0, len = ZR_EVENT_LISTENS.length; i < len; i++) {
                var eventName = ZR_EVENT_LISTENS[i];
                var eventValue = ZR_EVENT[eventName];
                eventBehaviors[eventValue] = '_on' + eventName.toLowerCase();
                _zr.on(eventValue, this._onzrevent);
            }
            this.chart = {};
            this.component = {};
            var Island = require('./chart/island');
            this._island = new Island(this._themeConfig, this._messageCenter, _zr, {}, this);
            this.chart.island = this._island;
            var componentLibrary = require('./component');
            componentLibrary.define('title', require('./component/title'));
            componentLibrary.define('tooltip', require('./component/tooltip'));
            componentLibrary.define('legend', require('./component/legend'));
            if (_zr.getWidth() === 0 || _zr.getHeight() === 0) {
                console.error('Dom’s width & height should be ready before init.');
            }
        },
        __onevent: function (param) {
            param.__echartsId = param.__echartsId || this.id;
            var fromMyself = param.__echartsId === this.id;
            if (!this._curEventType) {
                this._curEventType = param.type;
            }
            switch (param.type) {
                case ecConfig.EVENT.LEGEND_SELECTED:
                    this._onlegendSelected(param);
                    break;
                case ecConfig.EVENT.DATA_ZOOM:
                    if (!fromMyself) {
                        var dz = this.component.dataZoom;
                        if (dz) {
                            dz.silence(true);
                            dz.absoluteZoom(param.zoom);
                            dz.silence(false);
                        }
                    }
                    this._ondataZoom(param);
                    break;
                case ecConfig.EVENT.DATA_RANGE:
                    fromMyself && this._ondataRange(param);
                    break;
                case ecConfig.EVENT.TOOLTIP_HOVER:
                    fromMyself && this._tooltipHover(param);
                    break;
                case ecConfig.EVENT.RESTORE:
                    this._onrestore();
                    break;
                case ecConfig.EVENT.REFRESH:
                    fromMyself && this._onrefresh(param);
                    break;
                case ecConfig.EVENT.TOOLTIP_IN_GRID:
                case ecConfig.EVENT.TOOLTIP_OUT_GRID:
                    if (!fromMyself) {
                        var grid = this.component.grid;
                        if (grid) {
                            this._zr.trigger('mousemove', {
                                connectTrigger: true,
                                zrenderX: grid.getX() + param.x * grid.getWidth(),
                                zrenderY: grid.getY() + param.y * grid.getHeight()
                            });
                        }
                    } else if (this._connected) {
                        var grid = this.component.grid;
                        if (grid) {
                            param.x = (param.event.zrenderX - grid.getX()) / grid.getWidth();
                            param.y = (param.event.zrenderY - grid.getY()) / grid.getHeight();
                        }
                    }
                    break;
            }
            if (this._connected && fromMyself && this._curEventType === param.type) {
                for (var c in this._connected) {
                    this._connected[c].connectedEventHandler(param);
                }
                this._curEventType = null;
            }
            if (!fromMyself || !this._connected && fromMyself) {
                this._curEventType = null;
            }
        },
        _onclick: function (param) {
            callChartListMethodReverse(this, 'onclick', param);
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.CLICK, param.event, ecData, this);
                }
            }
        },
        _ondblclick: function (param) {
            callChartListMethodReverse(this, 'ondblclick', param);
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.DBLCLICK, param.event, ecData, this);
                }
            }
        },
        _oncontextmenu: function (param) {
            //if(arguments[0].event.button == '2'){
            //  callChartListMethodReverse(this, 'onmousedown', param);
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.CONTEXTMENU, param.event, ecData, this);
                }
            }
            //}
        },
        _onmouseover: function (param) {
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.HOVER, param.event, ecData, this);
                }
            }
        },
        _onmouseout: function (param) {
            if (param.target) {
                var ecData = this._eventPackage(param.target);
                if (ecData && ecData.seriesIndex != null) {
                    this._messageCenter.dispatch(ecConfig.EVENT.MOUSEOUT, param.event, ecData, this);
                }
            }
        },
        _ondragstart: function (param) {
            this._status = {
                dragIn: false,
                dragOut: false,
                needRefresh: false
            };
            callChartListMethodReverse(this, 'ondragstart', param);
        },
        _ondragenter: function (param) {
            callChartListMethodReverse(this, 'ondragenter', param);
        },
        _ondragover: function (param) {
            callChartListMethodReverse(this, 'ondragover', param);
        },
        _ondragleave: function (param) {
            callChartListMethodReverse(this, 'ondragleave', param);
        },
        _ondrop: function (param) {
            callChartListMethodReverse(this, 'ondrop', param, this._status);
            this._island.ondrop(param, this._status);
        },
        _ondragend: function (param) {
            callChartListMethodReverse(this, 'ondragend', param, this._status);
            //deleted by jswang begin
            // this._island.ondragend(param, this._status);
            //deleted by jswang end
            if (this._status.needRefresh) {
                this._syncBackupData(this._option);
                var messageCenter = this._messageCenter;
                messageCenter.dispatch(ecConfig.EVENT.DATA_CHANGED, param.event, this._eventPackage(param.target), this);
                messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _onlegendSelected: function (param) {
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'onlegendSelected', param, this._status);
            if (this._status.needRefresh) {
                this._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _ondataZoom: function (param) {
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'ondataZoom', param, this._status);
            if (this._status.needRefresh) {
                this._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, null, this);
            }
        },
        _ondataRange: function (param) {
            this._clearEffect();
            this._status.needRefresh = false;
            callChartListMethodReverse(this, 'ondataRange', param, this._status);
            if (this._status.needRefresh) {
                this._zr.refreshNextFrame();
            }
        },
        _tooltipHover: function (param) {
            var tipShape = [];
            callChartListMethodReverse(this, 'ontooltipHover', param, tipShape);
        },
        _onrestore: function () {
            this.restore();
        },
        _onrefresh: function (param) {
            this._refreshInside = true;
            this.refresh(param);
            this._refreshInside = false;
        },
        _syncBackupData: function (curOption) {
            this.component.dataZoom && this.component.dataZoom.syncBackupData(curOption);
        },
        _eventPackage: function (target) {
            if (target) {
                var ecData = require('./util/ecData');
                var seriesIndex = ecData.get(target, 'seriesIndex');
                var dataIndex = ecData.get(target, 'dataIndex');
                dataIndex = seriesIndex != -1 && this.component.dataZoom ? this.component.dataZoom.getRealDataIndex(seriesIndex, dataIndex) : dataIndex;
                return {
                    seriesIndex: seriesIndex,
                    seriesName: (ecData.get(target, 'series') || {}).name,
                    dataIndex: dataIndex,
                    data: ecData.get(target, 'data'),
                    name: ecData.get(target, 'name'),
                    value: ecData.get(target, 'value'),
                    special: ecData.get(target, 'special'),
                    position: target.position //暴露目标节点坐标 modified by myyao
                };
            }
            return;
        },
        _noDataCheck: function (magicOption) {
            var series = magicOption.series;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type == ecConfig.CHART_TYPE_MAP || series[i].data && series[i].data.length > 0 || series[i].markPoint && series[i].markPoint.data && series[i].markPoint.data.length > 0 || series[i].markLine && series[i].markLine.data && series[i].markLine.data.length > 0 || series[i].nodes && series[i].nodes.length > 0 || series[i].links && series[i].links.length > 0 || series[i].matrix && series[i].matrix.length > 0 || series[i].eventList && series[i].eventList.length > 0) {
                    return false;
                }
            }
            var loadOption = this._option && this._option.noDataLoadingOption || this._themeConfig.noDataLoadingOption || ecConfig.noDataLoadingOption || {
                    text: this._option && this._option.noDataText || this._themeConfig.noDataText || ecConfig.noDataText,
                    effect: this._option && this._option.noDataEffect || this._themeConfig.noDataEffect || ecConfig.noDataEffect
                };
            this.clear();
            return true;
        },
        _render: function (magicOption) {
            this._mergeGlobalConifg(magicOption);
            // if (this._noDataCheck(magicOption)) {
            //     return;
            // }
            var bgColor = magicOption.backgroundColor;
            if (bgColor) {
                if (!_canvasSupported && bgColor.indexOf('rgba') != -1) {
                    var cList = bgColor.split(',');
                    this.dom.style.filter = 'alpha(opacity=' + cList[3].substring(0, cList[3].lastIndexOf(')')) * 100 + ')';
                    cList.length = 3;
                    cList[0] = cList[0].replace('a', '');
                    this.dom.style.backgroundColor = cList.join(',') + ')';
                } else {
                    this.dom.style.backgroundColor = bgColor;
                }
            }
            this._zr.clearAnimation();
            this._chartList = [];
            var chartLibrary = require('./chart');
            var componentLibrary = require('./component');
            if (magicOption.xAxis || magicOption.yAxis) {
                magicOption.grid = magicOption.grid || {};
                magicOption.dataZoom = magicOption.dataZoom || {};
            }
            var componentList = [
                'title',
                'legend',
                'tooltip',
                'dataRange',
                'roamController',
                'grid',
                'dataZoom',
                'xAxis',
                'yAxis',
                'polar'
            ];
            var ComponentClass;
            var componentType;
            var component;
            for (var i = 0, l = componentList.length; i < l; i++) {
                componentType = componentList[i];
                component = this.component[componentType];
                if (magicOption[componentType]) {
                    if (component) {
                        component.refresh && component.refresh(magicOption);
                    } else {
                        ComponentClass = componentLibrary.get(/^[xy]Axis$/.test(componentType) ? 'axis' : componentType);
                        component = new ComponentClass(this._themeConfig, this._messageCenter, this._zr, magicOption, this, componentType);
                        this.component[componentType] = component;
                    }
                    this._chartList.push(component);
                } else if (component) {
                    component.dispose();
                    this.component[componentType] = null;
                    delete this.component[componentType];
                }
            }
            var ChartClass;
            var chartType;
            var chart;
            var chartMap = {};
            for (var i = 0, l = magicOption.series.length; i < l; i++) {
                chartType = magicOption.series[i].type;
                if (!chartType) {
                    console.error('series[' + i + '] chart type has not been defined.');
                    continue;
                }
                if (!chartMap[chartType]) {
                    chartMap[chartType] = true;
                    ChartClass = chartLibrary.get(chartType);
                    if (ChartClass) {
                        if (this.chart[chartType]) {
                            chart = this.chart[chartType];
                            chart.refresh(magicOption);
                        } else {
                            chart = new ChartClass(this._themeConfig, this._messageCenter, this._zr, magicOption, this);
                        }
                        this._chartList.push(chart);
                        this.chart[chartType] = chart;
                    } else {
                        console.error(chartType + ' has not been required.');
                    }
                }
            }
            for (chartType in this.chart) {
                if (chartType != ecConfig.CHART_TYPE_ISLAND && !chartMap[chartType]) {
                    this.chart[chartType].dispose();
                    this.chart[chartType] = null;
                    delete this.chart[chartType];
                }
            }
            this.component.grid && this.component.grid.refixAxisShape(this.component);
            this._island.refresh(magicOption);
            magicOption.animation && !magicOption.renderAsImage ? this._zr.refresh() : this._zr.render();
            var imgId = 'IMG' + this.id;
            var img = document.getElementById(imgId);
            if (magicOption.renderAsImage && _canvasSupported) {
                if (img) {
                    img.src = this.getDataURL(magicOption.renderAsImage);
                } else {
                    img = this.getImage(magicOption.renderAsImage);
                    img.id = imgId;
                    img.style.position = 'absolute';
                    img.style.left = 0;
                    img.style.top = 0;
                    this.dom.firstChild.appendChild(img);
                }
                this.un();
                this._zr.un();
                this._disposeChartList();
                this._zr.clear();
            } else if (img) {
                img.parentNode.removeChild(img);
            }
            img = null;
            this._option = magicOption;
        },
        restore: function () {
            this._clearEffect();
            this._option = zrUtil.clone(this._optionRestore);
            this._disposeChartList();
            this._island.clear();
            this._render(this._option);
        },
        refresh: function (param) {
            this._clearEffect();
            param = param || {};
            var magicOption = param.option;
            if (!this._refreshInside && magicOption) {
                magicOption = this.getOption();
                zrUtil.merge(magicOption, param.option, true);
                zrUtil.merge(this._optionRestore, param.option, true);
            }
            this._island.refresh(magicOption);
            this._zr.clearAnimation();
            for (var i = 0, l = this._chartList.length; i < l; i++) {
                this._chartList[i].refresh && this._chartList[i].refresh(magicOption);
            }
            this.component.grid && this.component.grid.refixAxisShape(this.component);
            this._zr.refresh();
        },
        _disposeChartList: function () {
            this._clearEffect();
            this._zr.clearAnimation();
            var len = this._chartList.length;
            while (len--) {
                var chart = this._chartList[len];
                if (chart) {
                    var chartType = chart.type;
                    this.chart[chartType] && delete this.chart[chartType];
                    this.component[chartType] && delete this.component[chartType];
                    chart.dispose && chart.dispose();
                }
            }
            this._chartList = [];
        },
        _mergeGlobalConifg: function (magicOption) {
            var mergeList = [
                'backgroundColor',
                'calculable',
                'calculableColor',
                'calculableHolderColor',
                'nameConnector',
                'valueConnector',
                'animation',
                'animationThreshold',
                'animationDuration',
                'animationDurationUpdate',
                'animationEasing',
                'addDataAnimation',
                'symbolList',
                'DRAG_ENABLE_TIME'
            ];
            var len = mergeList.length;
            while (len--) {
                var mergeItem = mergeList[len];
                if (magicOption[mergeItem] == null) {
                    magicOption[mergeItem] = this._themeConfig[mergeItem] != null ? this._themeConfig[mergeItem] : ecConfig[mergeItem];
                }
            }
            var themeColor = magicOption.color;
            if (!(themeColor && themeColor.length)) {
                themeColor = this._themeConfig.color || ecConfig.color;
            }
            this._zr.getColor = function (idx) {
                var zrColor = require('zrender/tool/color');
                return zrColor.getColor(idx, themeColor);
            };
            if (!_canvasSupported) {
                magicOption.animation = false;
                magicOption.addDataAnimation = false;
            }
        },
        setOption: function (option, notMerge) {
            return this._setOption(option, notMerge);
        },
        _setOption: function (option, notMerge) {
            if (!notMerge && this._option) {
                this._option = zrUtil.merge(this.getOption(), zrUtil.clone(option), true);
            } else {
                this._option = zrUtil.clone(option);
            }
            this._optionRestore = zrUtil.clone(this._option);
            if (!this._option.series || this._option.series.length === 0) {
                this._zr.clear();
                return;
            }
            this._render(this._option);
            return this;
        },
        getOption: function () {
            var magicOption = zrUtil.clone(this._option);
            var self = this;
            function restoreOption(prop) {
                var restoreSource = self._optionRestore[prop];
                if (restoreSource) {
                    if (restoreSource instanceof Array) {
                        var len = restoreSource.length;
                        while (len--) {
                            magicOption[prop][len].data = zrUtil.clone(restoreSource[len].data);
                        }
                    } else {
                        magicOption[prop].data = zrUtil.clone(restoreSource.data);
                    }
                }
            }
            restoreOption('xAxis');
            restoreOption('yAxis');
            restoreOption('series');
            return magicOption;
        },
        setSeries: function (series, notMerge) {
            if (!notMerge) {
                this.setOption({ series: series });
            } else {
                this._option.series = series;
                this.setOption(this._option, notMerge);
            }
            return this;
        },
        getSeries: function () {
            return this.getOption().series;
        },
        addData: function (seriesIdx, data, isHead, dataGrow, additionData) {
            var params = seriesIdx instanceof Array ? seriesIdx : [[
                seriesIdx,
                data,
                isHead,
                dataGrow,
                additionData
            ]];
            var magicOption = this.getOption();
            var optionRestore = this._optionRestore;
            for (var i = 0, l = params.length; i < l; i++) {
                seriesIdx = params[i][0];
                data = params[i][1];
                isHead = params[i][2];
                dataGrow = params[i][3];
                additionData = params[i][4];
                var seriesItem = optionRestore.series[seriesIdx];
                var inMethod = isHead ? 'unshift' : 'push';
                var outMethod = isHead ? 'pop' : 'shift';
                if (seriesItem) {
                    var seriesItemData = seriesItem.data;
                    var mSeriesItemData = magicOption.series[seriesIdx].data;
                    seriesItemData[inMethod](data);
                    mSeriesItemData[inMethod](data);
                    if (!dataGrow) {
                        seriesItemData[outMethod]();
                        data = mSeriesItemData[outMethod]();
                    }
                    if (additionData != null) {
                        var legend;
                        var legendData;
                        if (seriesItem.type === ecConfig.CHART_TYPE_PIE && (legend = optionRestore.legend) && (legendData = legend.data)) {
                            var mLegendData = magicOption.legend.data;
                            legendData[inMethod](additionData);
                            mLegendData[inMethod](additionData);
                            if (!dataGrow) {
                                var legendDataIdx = zrUtil.indexOf(legendData, data.name);
                                legendDataIdx != -1 && legendData.splice(legendDataIdx, 1);
                                legendDataIdx = zrUtil.indexOf(mLegendData, data.name);
                                legendDataIdx != -1 && mLegendData.splice(legendDataIdx, 1);
                            }
                        } else if (optionRestore.xAxis != null && optionRestore.yAxis != null) {
                            var axisData;
                            var mAxisData;
                            var axisIdx = seriesItem.xAxisIndex || 0;
                            if (optionRestore.xAxis[axisIdx].type == null || optionRestore.xAxis[axisIdx].type === 'category') {
                                axisData = optionRestore.xAxis[axisIdx].data;
                                mAxisData = magicOption.xAxis[axisIdx].data;
                                axisData[inMethod](additionData);
                                mAxisData[inMethod](additionData);
                                if (!dataGrow) {
                                    axisData[outMethod]();
                                    mAxisData[outMethod]();
                                }
                            }
                            axisIdx = seriesItem.yAxisIndex || 0;
                            if (optionRestore.yAxis[axisIdx].type === 'category') {
                                axisData = optionRestore.yAxis[axisIdx].data;
                                mAxisData = magicOption.yAxis[axisIdx].data;
                                axisData[inMethod](additionData);
                                mAxisData[inMethod](additionData);
                                if (!dataGrow) {
                                    axisData[outMethod]();
                                    mAxisData[outMethod]();
                                }
                            }
                        }
                    }
                    this._option.series[seriesIdx].data = magicOption.series[seriesIdx].data;
                }
            }
            this._zr.clearAnimation();
            var chartList = this._chartList;
            var chartAnimationCount = 0;
            var chartAnimationDone = function () {
                chartAnimationCount--;
                if (chartAnimationCount === 0) {
                    animationDone();
                }
            };
            for (var i = 0, l = chartList.length; i < l; i++) {
                if (magicOption.addDataAnimation && chartList[i].addDataAnimation) {
                    chartAnimationCount++;
                    chartList[i].addDataAnimation(params, chartAnimationDone);
                }
            }
            this.component.dataZoom && this.component.dataZoom.syncOption(magicOption);
            this._option = magicOption;
            var self = this;
            function animationDone() {
                if (!self._zr) {
                    return;
                }
                self._zr.clearAnimation();
                for (var i = 0, l = chartList.length; i < l; i++) {
                    chartList[i].motionlessOnce = magicOption.addDataAnimation && chartList[i].addDataAnimation;
                }
                self._messageCenter.dispatch(ecConfig.EVENT.REFRESH, null, { option: magicOption }, self);
            }
            if (!magicOption.addDataAnimation) {
                setTimeout(animationDone, 0);
            }
            return this;
        },
        getDom: function () {
            return this.dom;
        },
        getZrender: function () {
            return this._zr;
        },
        getDataURL: function (imgType) {
            if (!_canvasSupported) {
                return '';
            }
            if (this._chartList.length === 0) {
                var imgId = 'IMG' + this.id;
                var img = document.getElementById(imgId);
                if (img) {
                    return img.src;
                }
            }
            var tooltip = this.component.tooltip;
            tooltip && tooltip.hideTip();
            switch (imgType) {
                case 'jpeg':
                    break;
                default:
                    imgType = 'png';
            }
            var bgColor = this._option.backgroundColor;
            if (bgColor && bgColor.replace(' ', '') === 'rgba(0,0,0,0)') {
                bgColor = '#fff';
            }
            return this._zr.toDataURL('image/' + imgType, bgColor);
        },
        getImage: function (imgType) {
            var title = this._optionRestore.title;
            var imgDom = document.createElement('img');
            imgDom.src = this.getDataURL(imgType);
            imgDom.title = title && title.text || 'ECharts';
            return imgDom;
        },
        getConnectedDataURL: function (imgType) {
            if (!this.isConnected()) {
                return this.getDataURL(imgType);
            }
            var tempDom = this.dom;
            var imgList = {
                'self': {
                    img: this.getDataURL(imgType),
                    left: tempDom.offsetLeft,
                    top: tempDom.offsetTop,
                    right: tempDom.offsetLeft + tempDom.offsetWidth,
                    bottom: tempDom.offsetTop + tempDom.offsetHeight
                }
            };
            var minLeft = imgList.self.left;
            var minTop = imgList.self.top;
            var maxRight = imgList.self.right;
            var maxBottom = imgList.self.bottom;
            for (var c in this._connected) {
                tempDom = this._connected[c].getDom();
                imgList[c] = {
                    img: this._connected[c].getDataURL(imgType),
                    left: tempDom.offsetLeft,
                    top: tempDom.offsetTop,
                    right: tempDom.offsetLeft + tempDom.offsetWidth,
                    bottom: tempDom.offsetTop + tempDom.offsetHeight
                };
                minLeft = Math.min(minLeft, imgList[c].left);
                minTop = Math.min(minTop, imgList[c].top);
                maxRight = Math.max(maxRight, imgList[c].right);
                maxBottom = Math.max(maxBottom, imgList[c].bottom);
            }
            var zrDom = document.createElement('div');
            zrDom.style.position = 'absolute';
            zrDom.style.left = '-4000px';
            zrDom.style.width = maxRight - minLeft + 'px';
            zrDom.style.height = maxBottom - minTop + 'px';
            document.body.appendChild(zrDom);
            var zrImg = require('zrender').init(zrDom);
            var ImageShape = require('zrender/shape/Image');
            for (var c in imgList) {
                zrImg.addShape(new ImageShape({
                    style: {
                        x: imgList[c].left - minLeft,
                        y: imgList[c].top - minTop,
                        image: imgList[c].img
                    }
                }));
            }
            zrImg.render();
            var bgColor = this._option.backgroundColor;
            if (bgColor && bgColor.replace(/ /g, '') === 'rgba(0,0,0,0)') {
                bgColor = '#fff';
            }
            var image = zrImg.toDataURL('image/png', bgColor);
            setTimeout(function () {
                zrImg.dispose();
                zrDom.parentNode.removeChild(zrDom);
                zrDom = null;
            }, 100);
            return image;
        },
        getConnectedImage: function (imgType) {
            var title = this._optionRestore.title;
            var imgDom = document.createElement('img');
            imgDom.src = this.getConnectedDataURL(imgType);
            imgDom.title = title && title.text || 'ECharts';
            return imgDom;
        },
        on: function (eventName, eventListener) {
            this._messageCenterOutSide.bind(eventName, eventListener, this);
            return this;
        },
        un: function (eventName, eventListener) {
            this._messageCenterOutSide.unbind(eventName, eventListener);
            return this;
        },
        connect: function (connectTarget) {
            if (!connectTarget) {
                return this;
            }
            if (!this._connected) {
                this._connected = {};
            }
            if (connectTarget instanceof Array) {
                for (var i = 0, l = connectTarget.length; i < l; i++) {
                    this._connected[connectTarget[i].id] = connectTarget[i];
                }
            } else {
                this._connected[connectTarget.id] = connectTarget;
            }
            return this;
        },
        disConnect: function (connectTarget) {
            if (!connectTarget || !this._connected) {
                return this;
            }
            if (connectTarget instanceof Array) {
                for (var i = 0, l = connectTarget.length; i < l; i++) {
                    delete this._connected[connectTarget[i].id];
                }
            } else {
                delete this._connected[connectTarget.id];
            }
            for (var k in this._connected) {
                return k, this;
            }
            this._connected = false;
            return this;
        },
        connectedEventHandler: function (param) {
            if (param.__echartsId != this.id) {
                this._onevent(param);
            }
        },
        isConnected: function () {
            return !!this._connected;
        },
        showLoading: function (loadingOption) {
            var effectList = {
                bar: require('zrender/loadingEffect/Bar')
            };
            loadingOption = loadingOption || {};
            var textStyle = loadingOption.textStyle || {};
            loadingOption.textStyle = textStyle;
            var finalTextStyle = zrUtil.merge(zrUtil.merge(zrUtil.clone(textStyle), this._themeConfig.textStyle), ecConfig.textStyle);
            textStyle.textFont = finalTextStyle.fontStyle + ' ' + finalTextStyle.fontWeight + ' ' + finalTextStyle.fontSize + 'px ' + finalTextStyle.fontFamily;
            textStyle.text = loadingOption.text || this._option && this._option.loadingText || this._themeConfig.loadingText || ecConfig.loadingText;
            if (loadingOption.x != null) {
                textStyle.x = loadingOption.x;
            }
            if (loadingOption.y != null) {
                textStyle.y = loadingOption.y;
            }
            loadingOption.effectOption = loadingOption.effectOption || {};
            loadingOption.effectOption.textStyle = textStyle;
            var Effect = loadingOption.effect;
            if (typeof Effect === 'string' || Effect == null) {
                Effect = effectList[loadingOption.effect || this._option && this._option.loadingEffect || this._themeConfig.loadingEffect || ecConfig.loadingEffect] || effectList.spin;
            }
            this._zr.showLoading(new Effect(loadingOption.effectOption));
            return this;
        },
        hideLoading: function () {
            this._zr.hideLoading();
            return this;
        },
        setTheme: function (theme) {
            if (theme) {
                if (typeof theme === 'string') {
                    theme = {};
                } else {
                    theme = theme || {};
                }
                this._themeConfig = theme;
            }
            if (!_canvasSupported) {
                var textStyle = this._themeConfig.textStyle;
                textStyle && textStyle.fontFamily && textStyle.fontFamily2 && (textStyle.fontFamily = textStyle.fontFamily2);
                textStyle = ecConfig.textStyle;
                textStyle.fontFamily = textStyle.fontFamily2;
            }
            this._optionRestore && this.restore();
        },
        resize: function () {
            var self = this;
            return function () {
                self._clearEffect();
                self._zr.resize();
                if (self._option && self._option.renderAsImage && _canvasSupported) {
                    self._render(self._option);
                    return self;
                }
                self._zr.clearAnimation();
                self._island.resize();
                for (var i = 0, l = self._chartList.length; i < l; i++) {
                    self._chartList[i].resize && self._chartList[i].resize();
                }
                self.component.grid && self.component.grid.refixAxisShape(self.component);
                self._zr.refresh();
                self._messageCenter.dispatch(ecConfig.EVENT.RESIZE, null, null, self);
                return self;
            };
        },
        _clearEffect: function () {
            this._zr.modLayer(ecConfig.EFFECT_ZLEVEL, { motionBlur: false });
            this._zr.painter.clearLayer(ecConfig.EFFECT_ZLEVEL);
        },
        clear: function () {
            this._disposeChartList();
            this._zr.clear();
            this._option = {};
            this._optionRestore = {};
            this.dom.style.backgroundColor = null;
            return this;
        },
        dispose: function () {
            var key = this.dom.getAttribute(DOM_ATTRIBUTE_KEY);
            key && delete _instances[key];
            this._island.dispose();
            this._messageCenter.unbind();
            this.clear();
            this._zr.dispose();
            this._zr = null;
        }
    };
    return self;
});define('echarts/config', [], function () {
    var config = {
        CHART_TYPE_LINE: 'line',
        CHART_TYPE_BAR: 'bar',
        CHART_TYPE_SCATTER: 'scatter',
        CHART_TYPE_PIE: 'pie',
        CHART_TYPE_RADAR: 'radar',
        CHART_TYPE_VENN: 'venn',
        CHART_TYPE_TREEMAP: 'treemap',
        CHART_TYPE_MAP: 'map',
        CHART_TYPE_K: 'k',
        CHART_TYPE_ISLAND: 'island',
        CHART_TYPE_FORCE: 'force',
        CHART_TYPE_CHORD: 'chord',
        CHART_TYPE_GAUGE: 'gauge',
        CHART_TYPE_FUNNEL: 'funnel',
        CHART_TYPE_EVENTRIVER: 'eventRiver',
        COMPONENT_TYPE_TITLE: 'title',
        COMPONENT_TYPE_LEGEND: 'legend',
        COMPONENT_TYPE_TOOLTIP: 'tooltip',
        COMPONENT_TYPE_GRID: 'grid',
        COMPONENT_TYPE_AXIS: 'axis',
        COMPONENT_TYPE_POLAR: 'polar',
        COMPONENT_TYPE_X_AXIS: 'xAxis',
        COMPONENT_TYPE_Y_AXIS: 'yAxis',
        COMPONENT_TYPE_AXIS_CATEGORY: 'categoryAxis',
        COMPONENT_TYPE_AXIS_VALUE: 'valueAxis',
        COMPONENT_TYPE_ROAMCONTROLLER: 'roamController',
        backgroundColor: 'rgba(0,0,0,0)',
        color: [
            '#ff7f50',
            '#87cefa',
            '#da70d6',
            '#32cd32',
            '#6495ed',
            '#ff69b4',
            '#ba55d3',
            '#cd5c5c',
            '#ffa500',
            '#40e0d0',
            '#1e90ff',
            '#ff6347',
            '#7b68ee',
            '#00fa9a',
            '#ffd700',
            '#6699FF',
            '#ff6666',
            '#3cb371',
            '#b8860b',
            '#30e0e0'
        ],
        markPoint: {
            clickable: true,
            symbol: 'pin',
            symbolSize: 10,
            large: false,
            effect: {
                show: false,
                loop: true,
                period: 15,
                type: 'scale',
                scaleSize: 2,
                bounceDistance: 10
            },
            itemStyle: {
                normal: {
                    borderWidth: 2,
                    label: {
                        show: true,
                        position: 'inside'
                    }
                },
                emphasis: { label: { show: true } }
            }
        },
        markLine: {
            clickable: true,
            symbol: [
                'circle',
                'arrow'
            ],
            symbolSize: [
                2,
                4
            ],
            smoothness: 0.2,
            precision: 2,
            effect: {
                show: false,
                loop: true,
                period: 15,
                scaleSize: 2
            },
            bundling: {
                enable: false,
                maxTurningAngle: 45
            },
            itemStyle: {
                normal: {
                    borderWidth: 1.5,
                    label: {
                        show: true,
                        position: 'end'
                    },
                    lineStyle: { type: 'dashed' }
                },
                emphasis: {
                    label: { show: false },
                    lineStyle: {}
                }
            }
        },
        textStyle: {
            decoration: 'none',
            fontFamily: 'Arial, Verdana, sans-serif',
            fontFamily2: 'Microsoft Yahei',
            fontSize: 12,
            fontStyle: 'normal',
            fontWeight: 'normal'
        },
        EVENT: {
            REFRESH: 'refresh',
            RESTORE: 'restore',
            RESIZE: 'resize',
            CLICK: 'click',
            DBLCLICK: 'dblclick',
            CONTEXTMENU: 'contextmenu',
            HOVER: 'hover',
            MOUSEOUT: 'mouseout',
            DATA_CHANGED: 'dataChanged',
            DATA_ZOOM: 'dataZoom',
            DATA_RANGE: 'dataRange',
            DATA_RANGE_SELECTED: 'dataRangeSelected',
            DATA_RANGE_HOVERLINK: 'dataRangeHoverLink',
            LEGEND_SELECTED: 'legendSelected',
            LEGEND_HOVERLINK: 'legendHoverLink',
            MAP_SELECTED: 'mapSelected',
            PIE_SELECTED: 'pieSelected',
            MAP_ROAM: 'mapRoam',
            FORCE_LAYOUT_END: 'forceLayoutEnd',
            TOOLTIP_HOVER: 'tooltipHover',
            TOOLTIP_IN_GRID: 'tooltipInGrid',
            TOOLTIP_OUT_GRID: 'tooltipOutGrid',
            ROAMCONTROLLER: 'roamController'
        },
        DRAG_ENABLE_TIME: 120,
        EFFECT_ZLEVEL: 10,
        symbolList: [
            'circle',
            'rectangle',
            'triangle',
            'diamond',
            'emptyCircle',
            'emptyRectangle',
            'emptyTriangle',
            'emptyDiamond'
        ],
        loadingEffect: 'spin',
        loadingText: '数据读取中...',
        noDataEffect: 'bubble',
        noDataText: '暂无数据',
        calculable: false,
        calculableColor: 'rgba(255,165,0,0.6)',
        calculableHolderColor: '#ccc',
        nameConnector: ' & ',
        valueConnector: ': ',
        animation: true,
        addDataAnimation: true,
        animationThreshold: 2000,
        animationDuration: 2000,
        animationDurationUpdate: 500,
        animationEasing: 'ExponentialOut'
    };
    return config;
});define('zrender/tool/util', [
    'require'
], function (require) {
    var BUILTIN_OBJECT = {
        '[object Function]': 1,
        '[object RegExp]': 1,
        '[object Date]': 1,
        '[object Error]': 1,
        '[object CanvasGradient]': 1
    };
    var objToString = Object.prototype.toString;
    function isDom(obj) {
        return obj && obj.nodeType === 1 && typeof obj.nodeName == 'string';
    }
    function clone(source) {
        if (typeof source == 'object' && source !== null) {
            var result = source;
            if (source instanceof Array) {
                result = [];
                for (var i = 0, len = source.length; i < len; i++) {
                    result[i] = clone(source[i]);
                }
            } else if (!BUILTIN_OBJECT[objToString.call(source)] && !isDom(source)) {
                result = {};
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        result[key] = clone(source[key]);
                    }
                }
            }
            return result;
        }
        return source;
    }
    function mergeItem(target, source, key, overwrite) {
        if (source.hasOwnProperty(key)) {
            var targetProp = target[key];
            if (typeof targetProp == 'object' && !BUILTIN_OBJECT[objToString.call(targetProp)] && !isDom(targetProp)) {
                merge(target[key], source[key], overwrite);
            } else if (overwrite || !(key in target)) {
                target[key] = source[key];
            }
        }
    }
    function merge(target, source, overwrite) {
        for (var i in source) {
            mergeItem(target, source, i, overwrite);
        }
        return target;
    }
    var _ctx;
    function getContext() {
        if (!_ctx) {
            _ctx = document.createElement('canvas').getContext('2d');
        }
        return _ctx;
    }
    var _canvas;
    var _pixelCtx;
    var _width;
    var _height;
    var _offsetX = 0;
    var _offsetY = 0;
    function getPixelContext() {
        if (!_pixelCtx) {
            _canvas = document.createElement('canvas');
            _width = _canvas.width;
            _height = _canvas.height;
            _pixelCtx = _canvas.getContext('2d');
        }
        return _pixelCtx;
    }
    function adjustCanvasSize(x, y) {
        var _v = 100;
        var _flag;
        if (x + _offsetX > _width) {
            _width = x + _offsetX + _v;
            _canvas.width = _width;
            _flag = true;
        }
        if (y + _offsetY > _height) {
            _height = y + _offsetY + _v;
            _canvas.height = _height;
            _flag = true;
        }
        if (x < -_offsetX) {
            _offsetX = Math.ceil(-x / _v) * _v;
            _width += _offsetX;
            _canvas.width = _width;
            _flag = true;
        }
        if (y < -_offsetY) {
            _offsetY = Math.ceil(-y / _v) * _v;
            _height += _offsetY;
            _canvas.height = _height;
            _flag = true;
        }
        if (_flag) {
            _pixelCtx.translate(_offsetX, _offsetY);
        }
    }
    function getPixelOffset() {
        return {
            x: _offsetX,
            y: _offsetY
        };
    }
    function indexOf(array, value) {
        if (array.indexOf) {
            return array.indexOf(value);
        }
        for (var i = 0, len = array.length; i < len; i++) {
            if (array[i] === value) {
                return i;
            }
        }
        return -1;
    }
    function inherits(clazz, baseClazz) {
        var clazzPrototype = clazz.prototype;
        function F() {
        }
        F.prototype = baseClazz.prototype;
        clazz.prototype = new F();
        for (var prop in clazzPrototype) {
            clazz.prototype[prop] = clazzPrototype[prop];
        }
        clazz.constructor = clazz;
    }
    return {
        inherits: inherits,
        clone: clone,
        merge: merge,
        getContext: getContext,
        getPixelContext: getPixelContext,
        getPixelOffset: getPixelOffset,
        adjustCanvasSize: adjustCanvasSize,
        indexOf: indexOf
    };
});define('zrender/tool/event', [
    'require',
    '../mixin/Eventful'
], function (require) {
    'use strict';
    var Eventful = require('../mixin/Eventful');
    function getX(e) {
        return typeof e.zrenderX != 'undefined' && e.zrenderX || typeof e.offsetX != 'undefined' && e.offsetX || typeof e.layerX != 'undefined' && e.layerX || typeof e.clientX != 'undefined' && e.clientX;
    }
    function getY(e) {
        return typeof e.zrenderY != 'undefined' && e.zrenderY || typeof e.offsetY != 'undefined' && e.offsetY || typeof e.layerY != 'undefined' && e.layerY || typeof e.clientY != 'undefined' && e.clientY;
    }
    function getDelta(e) {
        return typeof e.zrenderDelta != 'undefined' && e.zrenderDelta || typeof e.wheelDelta != 'undefined' && e.wheelDelta || typeof e.detail != 'undefined' && -e.detail;
    }
    var stop = typeof window.addEventListener === 'function' ? function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.cancelBubble = true;
    } : function (e) {
        e.returnValue = false;
        e.cancelBubble = true;
    };
    return {
        getX: getX,
        getY: getY,
        getDelta: getDelta,
        stop: stop,
        Dispatcher: Eventful
    };
});define('zrender/tool/env', [], function () {
    function detect(ua) {
        var os = {};
        var browser = {};
        var firefox = ua.match(/Firefox\/([\d.]+)/);
        var ie = ua.match(/MSIE\s([\d.]+)/)
            // IE 11 Trident/7.0; rv:11.0
            || ua.match(/Trident\/.+?rv:(([\d.]+))/);
        var edge = ua.match(/Edge\/([\d.]+)/); // IE 12 and 12+
        var weChat = (/micromessenger/i).test(ua);
        if (firefox) {
            browser.firefox = true;
            browser.version = firefox[1];
        }
        if (ie) {
            browser.ie = true;
            browser.version = ie[1];
        }
        if (edge) {
            browser.edge = true;
            browser.version = edge[1];
        }
        // It is difficult to detect WeChat in Win Phone precisely, because ua can
        // not be set on win phone. So we do not consider Win Phone.
        if (weChat) {
            browser.weChat = true;
        }
        return {
            browser: browser,
            os: os,
            node: false,
            // 原生canvas支持，改极端点了
            // canvasSupported : !(browser.ie && parseFloat(browser.version) < 9)
            canvasSupported: !!document.createElement('canvas').getContext
        };
    }
    return detect(navigator.userAgent);
});define('zrender', ['zrender/zrender'], function (main) {return main;});
define('zrender/zrender', [
    'require',
    './tool/util',
    './tool/log',
    './tool/guid',
    './Handler',
    './Painter',
    './Storage',
    './animation/Animation',
    './tool/env'
], function (require) {
    var util = require('./tool/util');
    var log = require('./tool/log');
    var guid = require('./tool/guid');
    var Handler = require('./Handler');
    var Painter = require('./Painter');
    var Storage = require('./Storage');
    var Animation = require('./animation/Animation');
    var _instances = {};
    var zrender = {};
    zrender.version = '2.0.8';
    zrender.init = function (dom) {
        var zr = new ZRender(guid(), dom);
        _instances[zr.id] = zr;
        return zr;
    };
    zrender.dispose = function (zr) {
        if (zr) {
            zr.dispose();
        } else {
            for (var key in _instances) {
                _instances[key].dispose();
            }
            _instances = {};
        }
        return zrender;
    };
    zrender.getInstance = function (id) {
        return _instances[id];
    };
    zrender.delInstance = function (id) {
        delete _instances[id];
        return zrender;
    };
    function getFrameCallback(zrInstance) {
        return function () {
            var animatingElements = zrInstance.animatingElements;
            for (var i = 0, l = animatingElements.length; i < l; i++) {
                zrInstance.storage.mod(animatingElements[i].id);
            }
            if (animatingElements.length || zrInstance._needsRefreshNextFrame) {
                zrInstance.refresh();
            }
        };
    }
    var ZRender = function (id, dom) {
        this.id = id;
        this.env = require('./tool/env');
        this.storage = new Storage();
        this.painter = new Painter(dom, this.storage);
        this.handler = new Handler(dom, this.storage, this.painter);
        this.animatingElements = [];
        this.animation = new Animation({ stage: { update: getFrameCallback(this) } });
        this.animation.start();
        var self = this;
        this.painter.refreshNextFrame = function () {
            self.refreshNextFrame();
        };
        this._needsRefreshNextFrame = false;
        var self = this;
        var storage = this.storage;
        var oldDelFromMap = storage.delFromMap;
        storage.delFromMap = function (elId) {
            var el = storage.get(elId);
            self.stopAnimation(el);
            oldDelFromMap.call(storage, elId);
        };
    };
    ZRender.prototype.getId = function () {
        return this.id;
    };
    ZRender.prototype.addShape = function (shape) {
        this.addElement(shape);
        return this;
    };
    ZRender.prototype.addGroup = function (group) {
        this.addElement(group);
        return this;
    };
    ZRender.prototype.delShape = function (shapeId) {
        this.delElement(shapeId);
        return this;
    };
    ZRender.prototype.delGroup = function (groupId) {
        this.delElement(groupId);
        return this;
    };
    ZRender.prototype.modShape = function (shapeId, shape) {
        this.modElement(shapeId, shape);
        return this;
    };
    ZRender.prototype.modGroup = function (groupId, group) {
        this.modElement(groupId, group);
        return this;
    };
    ZRender.prototype.addElement = function (el) {
        this.storage.addRoot(el);
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.delElement = function (el) {
        this.storage.delRoot(el);
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.modElement = function (el, params) {
        this.storage.mod(el, params);
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.modLayer = function (zLevel, config) {
        this.painter.modLayer(zLevel, config);
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.addHoverShape = function (shape) {
        this.storage.addHover(shape);
        return this;
    };
    ZRender.prototype.render = function (callback) {
        this.painter.render(callback);
        this._needsRefreshNextFrame = false;
        return this;
    };
    ZRender.prototype.refresh = function (callback) {
        this.painter.refresh(callback);
        this._needsRefreshNextFrame = false;
        return this;
    };
    ZRender.prototype.refreshNextFrame = function () {
        this._needsRefreshNextFrame = true;
        return this;
    };
    ZRender.prototype.refreshHover = function (callback) {
        this.painter.refreshHover(callback);
        return this;
    };
    ZRender.prototype.refreshShapes = function (shapeList, callback) {
        this.painter.refreshShapes(shapeList, callback);
        return this;
    };
    ZRender.prototype.resize = function () {
        this.painter.resize();
        return this;
    };
    ZRender.prototype.animate = function (el, path, loop) {
        if (typeof el === 'string') {
            el = this.storage.get(el);
        }
        if (el) {
            var target;
            if (path) {
                var pathSplitted = path.split('.');
                var prop = el;
                for (var i = 0, l = pathSplitted.length; i < l; i++) {
                    if (!prop) {
                        continue;
                    }
                    prop = prop[pathSplitted[i]];
                }
                if (prop) {
                    target = prop;
                }
            } else {
                target = el;
            }
            if (!target) {
                log('Property "' + path + '" is not existed in element ' + el.id);
                return;
            }
            var animatingElements = this.animatingElements;
            if (el.__animators == null) {
                el.__animators = [];
            }
            var animators = el.__animators;
            if (animators.length === 0) {
                animatingElements.push(el);
            }
            var animator = this.animation.animate(target, { loop: loop }).done(function () {
                var idx = util.indexOf(el.__animators, animator);
                if (idx >= 0) {
                    animators.splice(idx, 1);
                }
                if (animators.length === 0) {
                    var idx = util.indexOf(animatingElements, el);
                    animatingElements.splice(idx, 1);
                }
            });
            animators.push(animator);
            return animator;
        } else {
            log('Element not existed');
        }
    };
    ZRender.prototype.stopAnimation = function (el) {
        if (el.__animators) {
            var animators = el.__animators;
            var len = animators.length;
            for (var i = 0; i < len; i++) {
                animators[i].stop();
            }
            if (len > 0) {
                var animatingElements = this.animatingElements;
                var idx = util.indexOf(animatingElements, el);
                if (idx >= 0) {
                    animatingElements.splice(idx, 1);
                }
            }
            animators.length = 0;
        }
        return this;
    };
    ZRender.prototype.clearAnimation = function () {
        this.animation.clear();
        this.animatingElements.length = 0;
        return this;
    };
    ZRender.prototype.showLoading = function (loadingEffect) {
        this.painter.showLoading(loadingEffect);
        return this;
    };
    ZRender.prototype.hideLoading = function () {
        this.painter.hideLoading();
        return this;
    };
    ZRender.prototype.getWidth = function () {
        return this.painter.getWidth();
    };
    ZRender.prototype.getHeight = function () {
        return this.painter.getHeight();
    };
    ZRender.prototype.toDataURL = function (type, backgroundColor, args) {
        return this.painter.toDataURL(type, backgroundColor, args);
    };
    ZRender.prototype.shapeToImage = function (e, width, height) {
        var id = guid();
        return this.painter.shapeToImage(id, e, width, height);
    };
    ZRender.prototype.on = function (eventName, eventHandler, context) {
        this.handler.on(eventName, eventHandler, context);
        return this;
    };
    ZRender.prototype.un = function (eventName, eventHandler) {
        this.handler.un(eventName, eventHandler);
        return this;
    };
    ZRender.prototype.trigger = function (eventName, event) {
        this.handler.trigger(eventName, event);
        return this;
    };
    ZRender.prototype.clear = function () {
        this.storage.delRoot();
        this.painter.clear();
        return this;
    };
    ZRender.prototype.dispose = function () {
        this.animation.stop();
        this.clear();
        this.storage.dispose();
        this.painter.dispose();
        this.handler.dispose();
        this.animation = this.animatingElements = this.storage = this.painter = this.handler = null;
        zrender.delInstance(this.id);
    };
    return zrender;
});define('zrender/config', [], function () {
    var config = {
        EVENT: {
            RESIZE: 'resize',
            CLICK: 'click',
            DBLCLICK: 'dblclick',
            CONTEXTMENU: 'contextmenu',
            MOUSEWHEEL: 'mousewheel',
            MOUSEMOVE: 'mousemove',
            MOUSEOVER: 'mouseover',
            MOUSEOUT: 'mouseout',
            MOUSEDOWN: 'mousedown',
            MOUSEUP: 'mouseup',
            GLOBALOUT: 'globalout',
            DRAGSTART: 'dragstart',
            DRAGEND: 'dragend',
            DRAGENTER: 'dragenter',
            DRAGOVER: 'dragover',
            DRAGLEAVE: 'dragleave',
            DROP: 'drop',
            touchClickDelay: 300
        },
        catchBrushException: false,
        debugMode: 0,
        devicePixelRatio: Math.max(window.devicePixelRatio || 1, 1)
    };
    return config;
});define('echarts/chart/island', [
    'require',
    './base',
    'zrender/shape/Circle',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/tool/event',
    'zrender/tool/color',
    '../util/accMath',
    '../chart'
], function (require) {
    var ChartBase = require('./base');
    var CircleShape = require('zrender/shape/Circle');
    var ecConfig = require('../config');
    ecConfig.island = {
        zlevel: 0,
        z: 5,
        r: 15,
        calculateStep: 0.1
    };
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrEvent = require('zrender/tool/event');
    function Island(ecTheme, messageCenter, zr, option, myChart) {
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        this._nameConnector;
        this._valueConnector;
        this._zrHeight = this.zr.getHeight();
        this._zrWidth = this.zr.getWidth();
        var self = this;
        self.shapeHandler.onmousewheel = function (param) {
            var shape = param.target;
            var event = param.event;
            var delta = zrEvent.getDelta(event);
            delta = delta > 0 ? -1 : 1;
            shape.style.r -= delta;
            shape.style.r = shape.style.r < 5 ? 5 : shape.style.r;
            var value = ecData.get(shape, 'value');
            var dvalue = value * self.option.island.calculateStep;
            value = dvalue > 1 ? Math.round(value - dvalue * delta) : +(value - dvalue * delta).toFixed(2);
            var name = ecData.get(shape, 'name');
            shape.style.text = name + ':' + value;
            ecData.set(shape, 'value', value);
            ecData.set(shape, 'name', name);
            self.zr.modShape(shape.id);
            self.zr.refreshNextFrame();
            zrEvent.stop(event);
        };
    }
    Island.prototype = {
        type: ecConfig.CHART_TYPE_ISLAND,
        _combine: function (tarShape, srcShape) {
            var zrColor = require('zrender/tool/color');
            var accMath = require('../util/accMath');
            var value = accMath.accAdd(ecData.get(tarShape, 'value'), ecData.get(srcShape, 'value'));
            var name = ecData.get(tarShape, 'name') + this._nameConnector + ecData.get(srcShape, 'name');
            tarShape.style.text = name + this._valueConnector + value;
            ecData.set(tarShape, 'value', value);
            ecData.set(tarShape, 'name', name);
            tarShape.style.r = this.option.island.r;
            tarShape.style.color = zrColor.mix(tarShape.style.color, srcShape.style.color);
        },
        refresh: function (newOption) {
            if (newOption) {
                newOption.island = this.reformOption(newOption.island);
                this.option = newOption;
                this._nameConnector = this.option.nameConnector;
                this._valueConnector = this.option.valueConnector;
            }
        },
        getOption: function () {
            return this.option;
        },
        resize: function () {
            var newWidth = this.zr.getWidth();
            var newHieght = this.zr.getHeight();
            var xScale = newWidth / (this._zrWidth || newWidth);
            var yScale = newHieght / (this._zrHeight || newHieght);
            if (xScale === 1 && yScale === 1) {
                return;
            }
            this._zrWidth = newWidth;
            this._zrHeight = newHieght;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.modShape(this.shapeList[i].id, {
                    style: {
                        x: Math.round(this.shapeList[i].style.x * xScale),
                        y: Math.round(this.shapeList[i].style.y * yScale)
                    }
                });
            }
        },
        add: function (shape) {
            var name = ecData.get(shape, 'name');
            var value = ecData.get(shape, 'value');
            var seriesName = ecData.get(shape, 'series') != null ? ecData.get(shape, 'series').name : '';
            var font = this.getFont(this.option.island.textStyle);
            var islandShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    x: shape.style.x,
                    y: shape.style.y,
                    r: this.option.island.r,
                    color: shape.style.color || shape.style.strokeColor,
                    text: name + this._valueConnector + value,
                    textFont: font
                },
                draggable: true,
                hoverable: true,
                onmousewheel: this.shapeHandler.onmousewheel,
                _type: 'island'
            };
            if (islandShape.style.color === '#fff') {
                islandShape.style.color = shape.style.strokeColor;
            }
            this.setCalculable(islandShape);
            islandShape.dragEnableTime = 0;
            ecData.pack(islandShape, { name: seriesName }, -1, value, -1, name);
            islandShape = new CircleShape(islandShape);
            this.shapeList.push(islandShape);
            this.zr.addShape(islandShape);
        },
        del: function (shape) {
            this.zr.delShape(shape.id);
            var newShapeList = [];
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].id != shape.id) {
                    newShapeList.push(this.shapeList[i]);
                }
            }
            this.shapeList = newShapeList;
        },
        ondrop: function (param, status) {
            if (!this.isDrop || !param.target) {
                return;
            }
            var target = param.target;
            var dragged = param.dragged;
            this._combine(target, dragged);
            this.zr.modShape(target.id);
            status.dragIn = true;
            this.isDrop = false;
            return;
        },
        ondragend: function (param, status) {
            var target = param.target;
            if (!this.isDragend) {
                if (!status.dragIn) {
                    target.style.x = zrEvent.getX(param.event);
                    target.style.y = zrEvent.getY(param.event);
                    this.add(target);
                    status.needRefresh = true;
                }
            } else {
                if (status.dragIn) {
                    this.del(target);
                    status.needRefresh = true;
                }
            }
            this.isDragend = false;
            return;
        }
    };
    zrUtil.inherits(Island, ChartBase);
    require('../chart').define('island', Island);
    return Island;
});define('echarts/component', [], function () {
    var self = {};
    var _componentLibrary = {};
    self.define = function (name, clazz) {
        _componentLibrary[name] = clazz;
        return self;
    };
    self.get = function (name) {
        return _componentLibrary[name];
    };
    return self;
});define('echarts/component/title', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Rectangle',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    'zrender/tool/color',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var RectangleShape = require('zrender/shape/Rectangle');
    var ecConfig = require('../config');
    ecConfig.title = {
        zlevel: 0,
        z: 6,
        show: true,
        text: '',
        subtext: '',
        x: 'left',
        y: 'top',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 5,
        itemGap: 5,
        textStyle: {
            fontSize: 18,
            fontWeight: 'bolder',
            color: '#333'
        },
        subtextStyle: { color: '#aaa' }
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    function Title(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.refresh(option);
    }
    Title.prototype = {
        type: ecConfig.COMPONENT_TYPE_TITLE,
        _buildShape: function () {
            if (!this.titleOption.show) {
                return;
            }
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            this._buildItem();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildItem: function () {
            var text = this.titleOption.text;
            var link = this.titleOption.link;
            var target = this.titleOption.target;
            var subtext = this.titleOption.subtext;
            var sublink = this.titleOption.sublink;
            var subtarget = this.titleOption.subtarget;
            var font = this.getFont(this.titleOption.textStyle);
            var subfont = this.getFont(this.titleOption.subtextStyle);
            var x = this._itemGroupLocation.x;
            var y = this._itemGroupLocation.y;
            var width = this._itemGroupLocation.width;
            var height = this._itemGroupLocation.height;
            var textShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    y: y,
                    color: this.titleOption.textStyle.color,
                    text: text,
                    textFont: font,
                    textBaseline: 'top'
                },
                highlightStyle: {
                    color: zrColor.lift(this.titleOption.textStyle.color, 1),
                    brushType: 'fill'
                },
                hoverable: false
            };
            if (link) {
                textShape.hoverable = true;
                textShape.clickable = true;
                textShape.onclick = function () {
                    if (!target || target != 'self') {
                        window.open(link);
                    } else {
                        window.location = link;
                    }
                };
            }
            var subtextShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    y: y + height,
                    color: this.titleOption.subtextStyle.color,
                    text: subtext,
                    textFont: subfont,
                    textBaseline: 'bottom'
                },
                highlightStyle: {
                    color: zrColor.lift(this.titleOption.subtextStyle.color, 1),
                    brushType: 'fill'
                },
                hoverable: false
            };
            if (sublink) {
                subtextShape.hoverable = true;
                subtextShape.clickable = true;
                subtextShape.onclick = function () {
                    if (!subtarget || subtarget != 'self') {
                        window.open(sublink);
                    } else {
                        window.location = sublink;
                    }
                };
            }
            switch (this.titleOption.x) {
                case 'center':
                    textShape.style.x = subtextShape.style.x = x + width / 2;
                    textShape.style.textAlign = subtextShape.style.textAlign = 'center';
                    break;
                case 'left':
                    textShape.style.x = subtextShape.style.x = x;
                    textShape.style.textAlign = subtextShape.style.textAlign = 'left';
                    break;
                case 'right':
                    textShape.style.x = subtextShape.style.x = x + width;
                    textShape.style.textAlign = subtextShape.style.textAlign = 'right';
                    break;
                default:
                    x = this.titleOption.x - 0;
                    x = isNaN(x) ? 0 : x;
                    textShape.style.x = subtextShape.style.x = x;
                    break;
            }
            if (this.titleOption.textAlign) {
                textShape.style.textAlign = subtextShape.style.textAlign = this.titleOption.textAlign;
            }
            this.shapeList.push(new TextShape(textShape));
            subtext !== '' && this.shapeList.push(new TextShape(subtextShape));
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.titleOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.titleOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.titleOption.backgroundColor,
                    strokeColor: this.titleOption.borderColor,
                    lineWidth: this.titleOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var padding = this.reformCssArray(this.titleOption.padding);
            var text = this.titleOption.text;
            var subtext = this.titleOption.subtext;
            var font = this.getFont(this.titleOption.textStyle);
            var subfont = this.getFont(this.titleOption.subtextStyle);
            var totalWidth = Math.max(zrArea.getTextWidth(text, font), zrArea.getTextWidth(subtext, subfont));
            var totalHeight = zrArea.getTextHeight(text, font) + (subtext === '' ? 0 : this.titleOption.itemGap + zrArea.getTextHeight(subtext, subfont));
            var x;
            var zrWidth = this.zr.getWidth();
            switch (this.titleOption.x) {
                case 'center':
                    x = Math.floor((zrWidth - totalWidth) / 2);
                    break;
                case 'left':
                    x = padding[3] + this.titleOption.borderWidth;
                    break;
                case 'right':
                    x = zrWidth - totalWidth - padding[1] - this.titleOption.borderWidth;
                    break;
                default:
                    x = this.titleOption.x - 0;
                    x = isNaN(x) ? 0 : x;
                    break;
            }
            var y;
            var zrHeight = this.zr.getHeight();
            switch (this.titleOption.y) {
                case 'top':
                    y = padding[0] + this.titleOption.borderWidth;
                    break;
                case 'bottom':
                    y = zrHeight - totalHeight - padding[2] - this.titleOption.borderWidth;
                    break;
                case 'center':
                    y = Math.floor((zrHeight - totalHeight) / 2);
                    break;
                default:
                    y = this.titleOption.y - 0;
                    y = isNaN(y) ? 0 : y;
                    break;
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight
            };
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.option.title = this.reformOption(this.option.title);
                this.titleOption = this.option.title;
                this.titleOption.textStyle = this.getTextStyle(this.titleOption.textStyle);
                this.titleOption.subtextStyle = this.getTextStyle(this.titleOption.subtextStyle);
            }
            this.clear();
            this._buildShape();
        }
    };
    zrUtil.inherits(Title, Base);
    require('../component').define('title', Title);
    return Title;
});define('echarts/component/tooltip', [
    'require',
    './base',
    '../util/shape/Cross',
    'zrender/shape/Line',
    'zrender/shape/Rectangle',
    '../config',
    '../util/ecData',
    'zrender/config',
    'zrender/tool/event',
    'zrender/tool/area',
    'zrender/tool/color',
    'zrender/tool/util',
    'zrender/shape/Base',
    '../component'
], function (require) {
    var Base = require('./base');
    var CrossShape = require('../util/shape/Cross');
    var LineShape = require('zrender/shape/Line');
    var RectangleShape = require('zrender/shape/Rectangle');
    var rectangleInstance = new RectangleShape({});
    var ecConfig = require('../config');
    ecConfig.tooltip = {
        zlevel: 1,
        z: 8,
        show: true,
        showContent: true,
        trigger: 'item',
        islandFormatter: '{a} <br/>{b} : {c}',
        showDelay: 20,
        hideDelay: 100,
        transitionDuration: 0.4,
        enterable: false,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderColor: '#333',
        borderRadius: 4,
        borderWidth: 0,
        padding: 5,
        axisPointer: {
            type: 'line',
            lineStyle: {
                color: '#48b',
                width: 2,
                type: 'solid'
            },
            crossStyle: {
                color: '#1e90ff',
                width: 1,
                type: 'dashed'
            },
            shadowStyle: {
                color: 'rgba(150,150,150,0.3)',
                width: 'auto',
                type: 'default'
            }
        },
        textStyle: { color: '#fff' }
    };
    var ecData = require('../util/ecData');
    var zrConfig = require('zrender/config');
    var zrEvent = require('zrender/tool/event');
    var zrArea = require('zrender/tool/area');
    var zrColor = require('zrender/tool/color');
    var zrUtil = require('zrender/tool/util');
    var zrShapeBase = require('zrender/shape/Base');
    function Tooltip(ecTheme, messageCenter, zr, option, myChart) {
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.dom = myChart.dom;
        var self = this;
        self._onmousemove = function (param) {
            return self.__onmousemove(param);
        };
        self._onglobalout = function (param) {
            return self.__onglobalout(param);
        };
        this.zr.on(zrConfig.EVENT.MOUSEMOVE, self._onmousemove);
        this.zr.on(zrConfig.EVENT.GLOBALOUT, self._onglobalout);
        self._hide = function (param) {
            return self.__hide(param);
        };
        self._tryShow = function (param) {
            return self.__tryShow(param);
        };
        self._refixed = function (param) {
            return self.__refixed(param);
        };
        self._setContent = function (ticket, res) {
            return self.__setContent(ticket, res);
        };
        this._tDom = this._tDom || document.createElement('div');
        this._tDom.onselectstart = function () {
            return false;
        };
        this._tDom.onmouseover = function () {
            self._mousein = true;
        };
        this._tDom.onmouseout = function () {
            self._mousein = false;
        };
        this._tDom.className = 'echarts-tooltip';
        this._tDom.style.position = 'absolute';
        this.hasAppend = false;
        this._axisLineShape && this.zr.delShape(this._axisLineShape.id);
        this._axisLineShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisLineShape);
        this.zr.addShape(this._axisLineShape);
        this._axisShadowShape && this.zr.delShape(this._axisShadowShape.id);
        this._axisShadowShape = new LineShape({
            zlevel: this.getZlevelBase(),
            z: 1,
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisShadowShape);
        this.zr.addShape(this._axisShadowShape);
        this._axisCrossShape && this.zr.delShape(this._axisCrossShape.id);
        this._axisCrossShape = new CrossShape({
            zlevel: this.getZlevelBase(),
            z: this.getZBase(),
            invisible: true,
            hoverable: false
        });
        this.shapeList.push(this._axisCrossShape);
        this.zr.addShape(this._axisCrossShape);
        this.showing = false;
        this.refresh(option);
    }
    Tooltip.prototype = {
        type: ecConfig.COMPONENT_TYPE_TOOLTIP,
        _gCssText: 'position:absolute;display:block;border-style:solid;white-space:nowrap;',
        _style: function (opt) {
            if (!opt) {
                return '';
            }
            var cssText = [];
            if (opt.transitionDuration) {
                var transitionText = 'left ' + opt.transitionDuration + 's,' + 'top ' + opt.transitionDuration + 's';
                cssText.push('transition:' + transitionText);
                cssText.push('-moz-transition:' + transitionText);
                cssText.push('-webkit-transition:' + transitionText);
                cssText.push('-o-transition:' + transitionText);
            }
            if (opt.backgroundColor) {
                cssText.push('background-Color:' + zrColor.toHex(opt.backgroundColor));
                cssText.push('filter:alpha(opacity=70)');
                cssText.push('background-Color:' + opt.backgroundColor);
            }
            if (opt.borderWidth != null) {
                cssText.push('border-width:' + opt.borderWidth + 'px');
            }
            if (opt.borderColor != null) {
                cssText.push('border-color:' + opt.borderColor);
            }
            if (opt.borderRadius != null) {
                cssText.push('border-radius:' + opt.borderRadius + 'px');
                cssText.push('-moz-border-radius:' + opt.borderRadius + 'px');
                cssText.push('-webkit-border-radius:' + opt.borderRadius + 'px');
                cssText.push('-o-border-radius:' + opt.borderRadius + 'px');
            }
            var textStyle = opt.textStyle;
            if (textStyle) {
                textStyle.color && cssText.push('color:' + textStyle.color);
                textStyle.decoration && cssText.push('text-decoration:' + textStyle.decoration);
                textStyle.align && cssText.push('text-align:' + textStyle.align);
                textStyle.fontFamily && cssText.push('font-family:' + textStyle.fontFamily);
                textStyle.fontSize && cssText.push('font-size:' + textStyle.fontSize + 'px');
                textStyle.fontSize && cssText.push('line-height:' + Math.round(textStyle.fontSize * 3 / 2) + 'px');
                textStyle.fontStyle && cssText.push('font-style:' + textStyle.fontStyle);
                textStyle.fontWeight && cssText.push('font-weight:' + textStyle.fontWeight);
            }
            var padding = opt.padding;
            if (padding != null) {
                padding = this.reformCssArray(padding);
                cssText.push('padding:' + padding[0] + 'px ' + padding[1] + 'px ' + padding[2] + 'px ' + padding[3] + 'px');
            }
            cssText = cssText.join(';') + ';';
            return cssText;
        },
        __hide: function () {
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            if (this._tDom) {
                this._tDom.style.display = 'none';
            }
            var needRefresh = false;
            if (!this._axisLineShape.invisible) {
                this._axisLineShape.invisible = true;
                this.zr.modShape(this._axisLineShape.id);
                needRefresh = true;
            }
            if (!this._axisShadowShape.invisible) {
                this._axisShadowShape.invisible = true;
                this.zr.modShape(this._axisShadowShape.id);
                needRefresh = true;
            }
            if (!this._axisCrossShape.invisible) {
                this._axisCrossShape.invisible = true;
                this.zr.modShape(this._axisCrossShape.id);
                needRefresh = true;
            }
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
                this._lastTipShape = false;
                this.shapeList.length = 2;
            }
            needRefresh && this.zr.refreshNextFrame();
            this.showing = false;
        },
        _show: function (position, x, y, specialCssText) {
            var domHeight = this._tDom.offsetHeight;
            var domWidth = this._tDom.offsetWidth;
            if (position) {
                if (typeof position === 'function') {
                    position = position([
                        x,
                        y
                    ]);
                }
                if (position instanceof Array) {
                    x = position[0];
                    y = position[1];
                }
            }
            if (x + domWidth > this._zrWidth) {
                x -= domWidth + 40;
            }
            if (y + domHeight > this._zrHeight) {
                y -= domHeight - 20;
            }
            //因最右方地图悬浮框过长会遮盖地图导致无法点击，故把悬浮框的top值增加
            y += 30;
            if (y < 20) {
                y = 0;
            }
            this._tDom.style.cssText = this._gCssText + this._defaultCssText + (specialCssText ? specialCssText : '') + 'left:' + x + 'px;top:' + y + 'px;';
            if (domHeight < 10 || domWidth < 10) {
                setTimeout(this._refixed, 20);
            }
            this.showing = true;
        },
        __refixed: function () {
            if (this._tDom) {
                var cssText = '';
                var domHeight = this._tDom.offsetHeight;
                var domWidth = this._tDom.offsetWidth;
                if (this._tDom.offsetLeft + domWidth > this._zrWidth) {
                    //原为this._zrWidth - domWidth - 20，因地图右方悬浮框过长会导致显示不完全所以改成40
                    cssText += 'left:' + (this._zrWidth - domWidth - 20) + 'px;';
                }
                if (this._tDom.offsetTop + domHeight > this._zrHeight) {
                    cssText += 'top:' + (this._zrHeight - domHeight - 10) + 'px;';
                }
                if (cssText !== '') {
                    this._tDom.style.cssText += cssText;
                }
            }
        },
        __tryShow: function () {
            var needShow;
            var trigger;
            if (!this._curTarget) {
                this._findPolarTrigger() || this._findAxisTrigger();
            } else {
                if (this._curTarget._type === 'island' && this.option.tooltip.show) {
                    this._showItemTrigger();
                    return;
                }
                var serie = ecData.get(this._curTarget, 'series');
                var data = ecData.get(this._curTarget, 'data');
                needShow = this.deepQuery([
                    data,
                    serie,
                    this.option
                ], 'tooltip.show');
                if (serie == null || data == null || !needShow) {
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                } else {
                    trigger = this.deepQuery([
                        data,
                        serie,
                        this.option
                    ], 'tooltip.trigger');
                    trigger === 'axis' ? this._showAxisTrigger(serie.xAxisIndex, serie.yAxisIndex, ecData.get(this._curTarget, 'dataIndex')) : this._showItemTrigger();
                }
            }
        },
        _findAxisTrigger: function () {
            if (!this.component.xAxis || !this.component.yAxis) {
                this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                return;
            }
            var series = this.option.series;
            var xAxisIndex;
            var yAxisIndex;
            for (var i = 0, l = series.length; i < l; i++) {
                if (this.deepQuery([
                        series[i],
                        this.option
                    ], 'tooltip.trigger') === 'axis') {
                    xAxisIndex = series[i].xAxisIndex || 0;
                    yAxisIndex = series[i].yAxisIndex || 0;
                    if (this.component.xAxis.getAxis(xAxisIndex) && this.component.xAxis.getAxis(xAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, this._getNearestDataIndex('x', this.component.xAxis.getAxis(xAxisIndex)));
                        return;
                    } else if (this.component.yAxis.getAxis(yAxisIndex) && this.component.yAxis.getAxis(yAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, this._getNearestDataIndex('y', this.component.yAxis.getAxis(yAxisIndex)));
                        return;
                    } else {
                        this._showAxisTrigger(xAxisIndex, yAxisIndex, -1);
                        return;
                    }
                }
            }
            if (this.option.tooltip.axisPointer.type === 'cross') {
                this._showAxisTrigger(-1, -1, -1);
            }
        },
        _findPolarTrigger: function () {
            if (!this.component.polar) {
                return false;
            }
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            var polarIndex = this.component.polar.getNearestIndex([
                x,
                y
            ]);
            var valueIndex;
            if (polarIndex) {
                valueIndex = polarIndex.valueIndex;
                polarIndex = polarIndex.polarIndex;
            } else {
                polarIndex = -1;
            }
            if (polarIndex != -1) {
                return this._showPolarTrigger(polarIndex, valueIndex);
            }
            return false;
        },
        _getNearestDataIndex: function (direction, categoryAxis) {
            var dataIndex = -1;
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            if (direction === 'x') {
                var left;
                var right;
                var xEnd = this.component.grid.getXend();
                var curCoord = categoryAxis.getCoordByIndex(dataIndex);
                while (curCoord < xEnd) {
                    right = curCoord;
                    if (curCoord <= x) {
                        left = curCoord;
                    } else {
                        break;
                    }
                    curCoord = categoryAxis.getCoordByIndex(++dataIndex);
                }
                if (dataIndex <= 0) {
                    dataIndex = 0;
                } else if (x - left <= right - x) {
                    dataIndex -= 1;
                } else {
                    if (categoryAxis.getNameByIndex(dataIndex) == null) {
                        dataIndex -= 1;
                    }
                }
                return dataIndex;
            } else {
                var top;
                var bottom;
                var yStart = this.component.grid.getY();
                var curCoord = categoryAxis.getCoordByIndex(dataIndex);
                while (curCoord > yStart) {
                    top = curCoord;
                    if (curCoord >= y) {
                        bottom = curCoord;
                    } else {
                        break;
                    }
                    curCoord = categoryAxis.getCoordByIndex(++dataIndex);
                }
                if (dataIndex <= 0) {
                    dataIndex = 0;
                } else if (y - top >= bottom - y) {
                    dataIndex -= 1;
                } else {
                    if (categoryAxis.getNameByIndex(dataIndex) == null) {
                        dataIndex -= 1;
                    }
                }
                return dataIndex;
            }
            return -1;
        },
        _showAxisTrigger: function (xAxisIndex, yAxisIndex, dataIndex) {
            !this._event.connectTrigger && this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_IN_GRID, this._event, null, this.myChart);
            if (this.component.xAxis == null || this.component.yAxis == null || xAxisIndex == null || yAxisIndex == null) {
                clearTimeout(this._hidingTicket);
                clearTimeout(this._showingTicket);
                this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                return;
            }
            var series = this.option.series;
            var seriesArray = [];
            var seriesIndex = [];
            var categoryAxis;
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this.option.tooltip.trigger === 'axis') {
                if (!this.option.tooltip.show) {
                    return;
                }
                formatter = this.option.tooltip.formatter;
                position = this.option.tooltip.position;
            }
            var axisLayout = xAxisIndex != -1 && this.component.xAxis.getAxis(xAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY ? 'xAxis' : yAxisIndex != -1 && this.component.yAxis.getAxis(yAxisIndex).type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY ? 'yAxis' : false;
            var x;
            var y;
            if (axisLayout) {
                var axisIndex = axisLayout == 'xAxis' ? xAxisIndex : yAxisIndex;
                categoryAxis = this.component[axisLayout].getAxis(axisIndex);
                for (var i = 0, l = series.length; i < l; i++) {
                    if (!this._isSelected(series[i].name)) {
                        continue;
                    }
                    if (series[i][axisLayout + 'Index'] === axisIndex && this.deepQuery([
                            series[i],
                            this.option
                        ], 'tooltip.trigger') === 'axis') {
                        showContent = this.query(series[i], 'tooltip.showContent') || showContent;
                        formatter = this.query(series[i], 'tooltip.formatter') || formatter;
                        position = this.query(series[i], 'tooltip.position') || position;
                        specialCssText += this._style(this.query(series[i], 'tooltip'));
                        if (series[i].stack != null && axisLayout == 'xAxis') {
                            seriesArray.unshift(series[i]);
                            seriesIndex.unshift(i);
                        } else {
                            seriesArray.push(series[i]);
                            seriesIndex.push(i);
                        }
                    }
                }
                this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_HOVER, this._event, {
                    seriesIndex: seriesIndex,
                    dataIndex: dataIndex
                }, this.myChart);
                var rect;
                if (axisLayout == 'xAxis') {
                    x = this.subPixelOptimize(categoryAxis.getCoordByIndex(dataIndex), this._axisLineWidth);
                    y = zrEvent.getY(this._event);
                    rect = [
                        x,
                        this.component.grid.getY(),
                        x,
                        this.component.grid.getYend()
                    ];
                } else {
                    x = zrEvent.getX(this._event);
                    y = this.subPixelOptimize(categoryAxis.getCoordByIndex(dataIndex), this._axisLineWidth);
                    rect = [
                        this.component.grid.getX(),
                        y,
                        this.component.grid.getXend(),
                        y
                    ];
                }
                this._styleAxisPointer(seriesArray, rect[0], rect[1], rect[2], rect[3], categoryAxis.getGap(), x, y);
            } else {
                x = zrEvent.getX(this._event);
                y = zrEvent.getY(this._event);
                this._styleAxisPointer(series, this.component.grid.getX(), y, this.component.grid.getXend(), y, 0, x, y);
                if (dataIndex >= 0) {
                    this._showItemTrigger(true);
                } else {
                    clearTimeout(this._hidingTicket);
                    clearTimeout(this._showingTicket);
                    this._tDom.style.display = 'none';
                }
            }
            if (seriesArray.length > 0) {
                this._lastItemTriggerId = -1;
                if (this._lastDataIndex != dataIndex || this._lastSeriesIndex != seriesIndex[0]) {
                    this._lastDataIndex = dataIndex;
                    this._lastSeriesIndex = seriesIndex[0];
                    var data;
                    var value;
                    if (typeof formatter === 'function') {
                        var params = [];
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            data = seriesArray[i].data[dataIndex];
                            value = this.getDataFromOption(data, '-');
                            params.push({
                                seriesIndex: seriesIndex[i],
                                seriesName: seriesArray[i].name || '',
                                series: seriesArray[i],
                                dataIndex: dataIndex,
                                data: data,
                                name: categoryAxis.getNameByIndex(dataIndex),
                                value: value,
                                0: seriesArray[i].name || '',
                                1: categoryAxis.getNameByIndex(dataIndex),
                                2: value,
                                3: data
                            });
                        }
                        this._curTicket = 'axis:' + dataIndex;
                        this._tDom.innerHTML = formatter.call(this.myChart, params, this._curTicket, this._setContent);
                    } else if (typeof formatter === 'string') {
                        this._curTicket = NaN;
                        formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}');
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            formatter = formatter.replace('{a' + i + '}', this._encodeHTML(seriesArray[i].name || ''));
                            formatter = formatter.replace('{b' + i + '}', this._encodeHTML(categoryAxis.getNameByIndex(dataIndex)));
                            data = seriesArray[i].data[dataIndex];
                            data = this.getDataFromOption(data, '-');
                            formatter = formatter.replace('{c' + i + '}', data instanceof Array ? data : this.numAddCommas(data));
                        }
                        this._tDom.innerHTML = formatter;
                    } else {
                        this._curTicket = NaN;
                        formatter = this._encodeHTML(categoryAxis.getNameByIndex(dataIndex));
                        for (var i = 0, l = seriesArray.length; i < l; i++) {
                            formatter += '<br/>' + this._encodeHTML(seriesArray[i].name || '') + ' : ';
                            data = seriesArray[i].data[dataIndex];
                            data = this.getDataFromOption(data, '-');
                            formatter += data instanceof Array ? data : this.numAddCommas(data);
                        }
                        this._tDom.innerHTML = formatter;
                    }
                }
                if (showContent === false || !this.option.tooltip.showContent) {
                    return;
                }
                if (!this.hasAppend) {
                    this._tDom.style.left = this._zrWidth / 2 + 'px';
                    this._tDom.style.top = this._zrHeight / 2 + 'px';
                    this.dom.firstChild.appendChild(this._tDom);
                    this.hasAppend = true;
                }
                this._show(position, x + 10, y + 10, specialCssText);
            }
        },
        _showPolarTrigger: function (polarIndex, dataIndex) {
            if (this.component.polar == null || polarIndex == null || dataIndex == null || dataIndex < 0) {
                return false;
            }
            var series = this.option.series;
            var seriesArray = [];
            var seriesIndex = [];
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this.option.tooltip.trigger === 'axis') {
                if (!this.option.tooltip.show) {
                    return false;
                }
                formatter = this.option.tooltip.formatter;
                position = this.option.tooltip.position;
            }
            var indicatorName = this.option.polar[polarIndex].indicator[dataIndex].text;
            for (var i = 0, l = series.length; i < l; i++) {
                if (!this._isSelected(series[i].name)) {
                    continue;
                }
                if (series[i].polarIndex === polarIndex && this.deepQuery([
                        series[i],
                        this.option
                    ], 'tooltip.trigger') === 'axis') {
                    showContent = this.query(series[i], 'tooltip.showContent') || showContent;
                    formatter = this.query(series[i], 'tooltip.formatter') || formatter;
                    position = this.query(series[i], 'tooltip.position') || position;
                    specialCssText += this._style(this.query(series[i], 'tooltip'));
                    seriesArray.push(series[i]);
                    seriesIndex.push(i);
                }
            }
            if (seriesArray.length > 0) {
                var polarData;
                var data;
                var value;
                var params = [];
                for (var i = 0, l = seriesArray.length; i < l; i++) {
                    polarData = seriesArray[i].data;
                    for (var j = 0, k = polarData.length; j < k; j++) {
                        data = polarData[j];
                        if (!this._isSelected(data.name)) {
                            continue;
                        }
                        data = data != null ? data : {
                            name: '',
                            value: { dataIndex: '-' }
                        };
                        value = this.getDataFromOption(data.value[dataIndex]);
                        params.push({
                            seriesIndex: seriesIndex[i],
                            seriesName: seriesArray[i].name || '',
                            series: seriesArray[i],
                            dataIndex: dataIndex,
                            data: data,
                            name: data.name,
                            indicator: indicatorName,
                            value: value,
                            0: seriesArray[i].name || '',
                            1: data.name,
                            2: value,
                            3: indicatorName
                        });
                    }
                }
                if (params.length <= 0) {
                    return;
                }
                this._lastItemTriggerId = -1;
                if (this._lastDataIndex != dataIndex || this._lastSeriesIndex != seriesIndex[0]) {
                    this._lastDataIndex = dataIndex;
                    this._lastSeriesIndex = seriesIndex[0];
                    if (typeof formatter === 'function') {
                        this._curTicket = 'axis:' + dataIndex;
                        this._tDom.innerHTML = formatter.call(this.myChart, params, this._curTicket, this._setContent);
                    } else if (typeof formatter === 'string') {
                        formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}').replace('{d}', '{d0}');
                        for (var i = 0, l = params.length; i < l; i++) {
                            formatter = formatter.replace('{a' + i + '}', this._encodeHTML(params[i].seriesName));
                            formatter = formatter.replace('{b' + i + '}', this._encodeHTML(params[i].name));
                            formatter = formatter.replace('{c' + i + '}', this.numAddCommas(params[i].value));
                            formatter = formatter.replace('{d' + i + '}', this._encodeHTML(params[i].indicator));
                        }
                        this._tDom.innerHTML = formatter;
                    } else {
                        formatter = this._encodeHTML(params[0].name) + '<br/>' + this._encodeHTML(params[0].indicator) + ' : ' + this.numAddCommas(params[0].value);
                        for (var i = 1, l = params.length; i < l; i++) {
                            formatter += '<br/>' + this._encodeHTML(params[i].name) + '<br/>';
                            formatter += this._encodeHTML(params[i].indicator) + ' : ' + this.numAddCommas(params[i].value);
                        }
                        this._tDom.innerHTML = formatter;
                    }
                }
                if (showContent === false || !this.option.tooltip.showContent) {
                    return;
                }
                if (!this.hasAppend) {
                    this._tDom.style.left = this._zrWidth / 2 + 'px';
                    this._tDom.style.top = this._zrHeight / 2 + 'px';
                    this.dom.firstChild.appendChild(this._tDom);
                    this.hasAppend = true;
                }
                this._show(position, zrEvent.getX(this._event), zrEvent.getY(this._event), specialCssText);
                return true;
            }
        },
        _showItemTrigger: function (axisTrigger) {
            if (!this._curTarget) {
                return;
            }
            var serie = ecData.get(this._curTarget, 'series');
            var seriesIndex = ecData.get(this._curTarget, 'seriesIndex');
            var data = ecData.get(this._curTarget, 'data');
            var dataIndex = ecData.get(this._curTarget, 'dataIndex');
            var name = ecData.get(this._curTarget, 'name');
            var value = ecData.get(this._curTarget, 'value');
            var special = ecData.get(this._curTarget, 'special');
            var special2 = ecData.get(this._curTarget, 'special2');
            var queryTarget = [
                data,
                serie,
                this.option
            ];
            var formatter;
            var position;
            var showContent;
            var specialCssText = '';
            if (this._curTarget._type != 'island') {
                var trigger = axisTrigger ? 'axis' : 'item';
                if (this.option.tooltip.trigger === trigger) {
                    formatter = this.option.tooltip.formatter;
                    position = this.option.tooltip.position;
                }
                if (this.query(serie, 'tooltip.trigger') === trigger) {
                    showContent = this.query(serie, 'tooltip.showContent') || showContent;
                    formatter = this.query(serie, 'tooltip.formatter') || formatter;
                    position = this.query(serie, 'tooltip.position') || position;
                    specialCssText += this._style(this.query(serie, 'tooltip'));
                }
                showContent = this.query(data, 'tooltip.showContent') || showContent;
                formatter = this.query(data, 'tooltip.formatter') || formatter;
                position = this.query(data, 'tooltip.position') || position;
                specialCssText += this._style(this.query(data, 'tooltip'));
            } else {
                this._lastItemTriggerId = NaN;
                showContent = this.deepQuery(queryTarget, 'tooltip.showContent');
                formatter = this.deepQuery(queryTarget, 'tooltip.islandFormatter');
                position = this.deepQuery(queryTarget, 'tooltip.islandPosition');
            }
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            if (this._lastItemTriggerId !== this._curTarget.id) {
                this._lastItemTriggerId = this._curTarget.id;
                if (typeof formatter === 'function') {
                    this._curTicket = (serie.name || '') + ':' + dataIndex;
                    this._tDom.innerHTML = formatter.call(this.myChart, {
                        seriesIndex: seriesIndex,
                        seriesName: serie.name || '',
                        series: serie,
                        dataIndex: dataIndex,
                        data: data,
                        name: name,
                        value: value,
                        percent: special,
                        indicator: special,
                        value2: special2,
                        indicator2: special2,
                        0: serie.name || '',
                        1: name,
                        2: value,
                        3: special,
                        4: special2,
                        5: data,
                        6: seriesIndex,
                        7: dataIndex
                    }, this._curTicket, this._setContent);
                } else if (typeof formatter === 'string') {
                    this._curTicket = NaN;
                    formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}');
                    formatter = formatter.replace('{a0}', this._encodeHTML(serie.name || '')).replace('{b0}', this._encodeHTML(name)).replace('{c0}', value instanceof Array ? value : this.numAddCommas(value));
                    formatter = formatter.replace('{d}', '{d0}').replace('{d0}', special || '');
                    formatter = formatter.replace('{e}', '{e0}').replace('{e0}', ecData.get(this._curTarget, 'special2') || '');
                    this._tDom.innerHTML = formatter;
                } else {
                    this._curTicket = NaN;
                    if (serie.type === ecConfig.CHART_TYPE_RADAR && special) {
                        this._tDom.innerHTML = this._itemFormatter.radar.call(this, serie, name, value, special);
                    } else if (serie.type === ecConfig.CHART_TYPE_EVENTRIVER) {
                        this._tDom.innerHTML = this._itemFormatter.eventRiver.call(this, serie, name, value, data);
                    } else {
                        this._tDom.innerHTML = '' + (serie.name != null ? this._encodeHTML(serie.name) + '<br/>' : '') + (name === '' ? '' : this._encodeHTML(name) + ' : ') + (value instanceof Array ? value : this.numAddCommas(value));
                    }
                }
            }
            var x = zrEvent.getX(this._event);
            var y = zrEvent.getY(this._event);
            if (this.deepQuery(queryTarget, 'tooltip.axisPointer.show') && this.component.grid) {
                this._styleAxisPointer([serie], this.component.grid.getX(), y, this.component.grid.getXend(), y, 0, x, y);
            } else {
                this._hide();
            }
            if (showContent === false || !this.option.tooltip.showContent) {
                return;
            }
            if (!this.hasAppend) {
                this._tDom.style.left = this._zrWidth / 2 + 'px';
                this._tDom.style.top = this._zrHeight / 2 + 'px';
                this.dom.firstChild.appendChild(this._tDom);
                this.hasAppend = true;
            }
            this._show(position, x + 20, y - 20, specialCssText);
        },
        _itemFormatter: {
            radar: function (serie, name, value, indicator) {
                var html = '';
                html += this._encodeHTML(name === '' ? serie.name || '' : name);
                html += html === '' ? '' : '<br />';
                for (var i = 0; i < indicator.length; i++) {
                    html += this._encodeHTML(indicator[i].text) + ' : ' + this.numAddCommas(value[i]) + '<br />';
                }
                return html;
            },
            chord: function (serie, name, value, special, special2) {
                if (special2 == null) {
                    return this._encodeHTML(name) + ' (' + this.numAddCommas(value) + ')';
                } else {
                    var name1 = this._encodeHTML(name);
                    var name2 = this._encodeHTML(special);
                    return '' + (serie.name != null ? this._encodeHTML(serie.name) + '<br/>' : '') + name1 + ' -> ' + name2 + ' (' + this.numAddCommas(value) + ')' + '<br />' + name2 + ' -> ' + name1 + ' (' + this.numAddCommas(special2) + ')';
                }
            },
            eventRiver: function (serie, name, value, data) {
                var html = '';
                html += this._encodeHTML(serie.name === '' ? '' : serie.name + ' : ');
                html += this._encodeHTML(name);
                html += html === '' ? '' : '<br />';
                data = data.evolution;
                for (var i = 0, l = data.length; i < l; i++) {
                    html += '<div style="padding-top:5px;">';
                    if (!data[i].detail) {
                        continue;
                    }
                    if (data[i].detail.img) {
                        html += '<img src="' + data[i].detail.img + '" style="float:left;width:40px;height:40px;">';
                    }
                    html += '<div style="margin-left:45px;">' + data[i].time + '<br/>';
                    html += '<a href="' + data[i].detail.link + '" target="_blank">';
                    html += data[i].detail.text + '</a></div>';
                    html += '</div>';
                }
                return html;
            }
        },
        _styleAxisPointer: function (seriesArray, xStart, yStart, xEnd, yEnd, gap, x, y) {
            if (seriesArray.length > 0) {
                var queryTarget;
                var curType;
                var axisPointer = this.option.tooltip.axisPointer;
                var pointType = axisPointer.type;
                var style = {
                    line: {},
                    cross: {},
                    shadow: {}
                };
                for (var pType in style) {
                    style[pType].color = axisPointer[pType + 'Style'].color;
                    style[pType].width = axisPointer[pType + 'Style'].width;
                    style[pType].type = axisPointer[pType + 'Style'].type;
                }
                for (var i = 0, l = seriesArray.length; i < l; i++) {
                    queryTarget = seriesArray[i];
                    curType = this.query(queryTarget, 'tooltip.axisPointer.type');
                    pointType = curType || pointType;
                    if (curType) {
                        style[curType].color = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.color') || style[curType].color;
                        style[curType].width = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.width') || style[curType].width;
                        style[curType].type = this.query(queryTarget, 'tooltip.axisPointer.' + curType + 'Style.type') || style[curType].type;
                    }
                }
                if (pointType === 'line') {
                    var lineWidth = style.line.width;
                    var isVertical = xStart == xEnd;
                    this._axisLineShape.style = {
                        xStart: isVertical ? this.subPixelOptimize(xStart, lineWidth) : xStart,
                        yStart: isVertical ? yStart : this.subPixelOptimize(yStart, lineWidth),
                        xEnd: isVertical ? this.subPixelOptimize(xEnd, lineWidth) : xEnd,
                        yEnd: isVertical ? yEnd : this.subPixelOptimize(yEnd, lineWidth),
                        strokeColor: style.line.color,
                        lineWidth: lineWidth,
                        lineType: style.line.type
                    };
                    this._axisLineShape.invisible = false;
                    this.zr.modShape(this._axisLineShape.id);
                } else if (pointType === 'cross') {
                    var crossWidth = style.cross.width;
                    this._axisCrossShape.style = {
                        brushType: 'stroke',
                        rect: this.component.grid.getArea(),
                        x: this.subPixelOptimize(x, crossWidth),
                        y: this.subPixelOptimize(y, crossWidth),
                        text: ('( ' + this.component.xAxis.getAxis(0).getValueFromCoord(x) + ' , ' + this.component.yAxis.getAxis(0).getValueFromCoord(y) + ' )').replace('  , ', ' ').replace(' ,  ', ' '),
                        textPosition: 'specific',
                        strokeColor: style.cross.color,
                        lineWidth: crossWidth,
                        lineType: style.cross.type
                    };
                    if (this.component.grid.getXend() - x > 100) {
                        this._axisCrossShape.style.textAlign = 'left';
                        this._axisCrossShape.style.textX = x + 10;
                    } else {
                        this._axisCrossShape.style.textAlign = 'right';
                        this._axisCrossShape.style.textX = x - 10;
                    }
                    if (y - this.component.grid.getY() > 50) {
                        this._axisCrossShape.style.textBaseline = 'bottom';
                        this._axisCrossShape.style.textY = y - 10;
                    } else {
                        this._axisCrossShape.style.textBaseline = 'top';
                        this._axisCrossShape.style.textY = y + 10;
                    }
                    this._axisCrossShape.invisible = false;
                    this.zr.modShape(this._axisCrossShape.id);
                } else if (pointType === 'shadow') {
                    if (style.shadow.width == null || style.shadow.width === 'auto' || isNaN(style.shadow.width)) {
                        style.shadow.width = gap;
                    }
                    if (xStart === xEnd) {
                        if (Math.abs(this.component.grid.getX() - xStart) < 2) {
                            style.shadow.width /= 2;
                            xStart = xEnd = xEnd + style.shadow.width / 2;
                        } else if (Math.abs(this.component.grid.getXend() - xStart) < 2) {
                            style.shadow.width /= 2;
                            xStart = xEnd = xEnd - style.shadow.width / 2;
                        }
                    } else if (yStart === yEnd) {
                        if (Math.abs(this.component.grid.getY() - yStart) < 2) {
                            style.shadow.width /= 2;
                            yStart = yEnd = yEnd + style.shadow.width / 2;
                        } else if (Math.abs(this.component.grid.getYend() - yStart) < 2) {
                            style.shadow.width /= 2;
                            yStart = yEnd = yEnd - style.shadow.width / 2;
                        }
                    }
                    this._axisShadowShape.style = {
                        xStart: xStart,
                        yStart: yStart,
                        xEnd: xEnd,
                        yEnd: yEnd,
                        strokeColor: style.shadow.color,
                        lineWidth: style.shadow.width
                    };
                    this._axisShadowShape.invisible = false;
                    this.zr.modShape(this._axisShadowShape.id);
                }
                this.zr.refreshNextFrame();
            }
        },
        __onmousemove: function (param) {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            if (this._mousein && this._enterable) {
                return;
            }
            var target = param.target;
            var mx = zrEvent.getX(param.event);
            var my = zrEvent.getY(param.event);
            if (!target) {
                this._curTarget = false;
                this._event = param.event;
                this._event.zrenderX = mx;
                this._event.zrenderY = my;
                if (this._needAxisTrigger && this.component.grid && zrArea.isInside(rectangleInstance, this.component.grid.getArea(), mx, my)) {
                    this._showingTicket = setTimeout(this._tryShow, this._showDelay);
                } else if (this._needAxisTrigger && this.component.polar && this.component.polar.isInside([
                        mx,
                        my
                    ]) != -1) {
                    this._showingTicket = setTimeout(this._tryShow, this._showDelay);
                } else {
                    !this._event.connectTrigger && this.messageCenter.dispatch(ecConfig.EVENT.TOOLTIP_OUT_GRID, this._event, null, this.myChart);
                    this._hidingTicket = setTimeout(this._hide, this._hideDelay);
                }
            } else {
                this._curTarget = target;
                this._event = param.event;
                this._event.zrenderX = mx;
                this._event.zrenderY = my;
                var polarIndex;
                if (this._needAxisTrigger && this.component.polar && (polarIndex = this.component.polar.isInside([
                        mx,
                        my
                    ])) != -1) {
                    var series = this.option.series;
                    for (var i = 0, l = series.length; i < l; i++) {
                        if (series[i].polarIndex === polarIndex && this.deepQuery([
                                series[i],
                                this.option
                            ], 'tooltip.trigger') === 'axis') {
                            this._curTarget = null;
                            break;
                        }
                    }
                }
                this._showingTicket = setTimeout(this._tryShow, this._showDelay);
            }
        },
        __onglobalout: function () {
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            this._hidingTicket = setTimeout(this._hide, this._hideDelay);
        },
        __setContent: function (ticket, content) {
            if (!this._tDom) {
                return;
            }
            if (ticket === this._curTicket) {
                this._tDom.innerHTML = content;
            }
            setTimeout(this._refixed, 20);
        },
        ontooltipHover: function (param, tipShape) {
            if (!this._lastTipShape || this._lastTipShape && this._lastTipShape.dataIndex != param.dataIndex) {
                if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                    this.zr.delShape(this._lastTipShape.tipShape);
                    this.shapeList.length = 2;
                }
                for (var i = 0, l = tipShape.length; i < l; i++) {
                    tipShape[i].zlevel = this.getZlevelBase();
                    tipShape[i].z = this.getZBase();
                    tipShape[i].style = zrShapeBase.prototype.getHighlightStyle(tipShape[i].style, tipShape[i].highlightStyle);
                    tipShape[i].draggable = false;
                    tipShape[i].hoverable = false;
                    tipShape[i].clickable = false;
                    tipShape[i].ondragend = null;
                    tipShape[i].ondragover = null;
                    tipShape[i].ondrop = null;
                    this.shapeList.push(tipShape[i]);
                    this.zr.addShape(tipShape[i]);
                }
                this._lastTipShape = {
                    dataIndex: param.dataIndex,
                    tipShape: tipShape
                };
            }
        },
        ondragend: function () {
            this._hide();
        },
        onlegendSelected: function (param) {
            this._selectedMap = param.selected;
        },
        _setSelectedMap: function () {
            if (this.component.legend) {
                this._selectedMap = zrUtil.clone(this.component.legend.getSelectedMap());
            } else {
                this._selectedMap = {};
            }
        },
        _isSelected: function (itemName) {
            if (this._selectedMap[itemName] != null) {
                return this._selectedMap[itemName];
            } else {
                return true;
            }
        },
        showTip: function (params) {
            if (!params) {
                return;
            }
            var seriesIndex;
            var series = this.option.series;
            if (params.seriesIndex != null) {
                seriesIndex = params.seriesIndex;
            } else {
                var seriesName = params.seriesName;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (series[i].name === seriesName) {
                        seriesIndex = i;
                        break;
                    }
                }
            }
            var serie = series[seriesIndex];
            if (serie == null) {
                return;
            }
            var chart = this.myChart.chart[serie.type];
            var isAxisTrigger = this.deepQuery([
                    serie,
                    this.option
                ], 'tooltip.trigger') === 'axis';
            if (!chart) {
                return;
            }
            if (isAxisTrigger) {

            } else {
                var shapeList = chart.shapeList;
                var x;
                var y;
                switch (chart.type) {
                    case ecConfig.CHART_TYPE_FORCE:
                        var name = params.name;
                        for (var i = 0, l = shapeList.length; i < l; i++) {
                            if (shapeList[i].type === 'circle' && ecData.get(shapeList[i], 'name') == name) {
                                this._curTarget = shapeList[i];
                                x = this._curTarget.position[0];
                                y = this._curTarget.position[1];
                                break;
                            }
                        }
                        break;
                }
                if (x != null && y != null) {
                    this._event = {
                        zrenderX: x,
                        zrenderY: y
                    };
                    this.zr.addHoverShape(this._curTarget);
                    this.zr.refreshHover();
                    this._showItemTrigger();
                }
            }
        },
        hideTip: function () {
            this._hide();
        },
        refresh: function (newOption) {
            this._zrHeight = this.zr.getHeight();
            this._zrWidth = this.zr.getWidth();
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
            }
            this._lastTipShape = false;
            this.shapeList.length = 2;
            this._lastDataIndex = -1;
            this._lastSeriesIndex = -1;
            this._lastItemTriggerId = -1;
            if (newOption) {
                this.option = newOption;
                this.option.tooltip = this.reformOption(this.option.tooltip);
                this.option.tooltip.textStyle = zrUtil.merge(this.option.tooltip.textStyle, this.ecTheme.textStyle);
                this._needAxisTrigger = false;
                if (this.option.tooltip.trigger === 'axis') {
                    this._needAxisTrigger = true;
                }
                var series = this.option.series;
                for (var i = 0, l = series.length; i < l; i++) {
                    if (this.query(series[i], 'tooltip.trigger') === 'axis') {
                        this._needAxisTrigger = true;
                        break;
                    }
                }
                this._showDelay = this.option.tooltip.showDelay;
                this._hideDelay = this.option.tooltip.hideDelay;
                this._defaultCssText = this._style(this.option.tooltip);
                this._setSelectedMap();
                this._axisLineWidth = this.option.tooltip.axisPointer.lineStyle.width;
                this._enterable = this.option.tooltip.enterable;
            }
            if (this.showing) {
                var self = this;
                setTimeout(function () {
                    self.zr.trigger(zrConfig.EVENT.MOUSEMOVE, self.zr.handler._event);
                }, 50);
            }
        },
        onbeforDispose: function () {
            if (this._lastTipShape && this._lastTipShape.tipShape.length > 0) {
                this.zr.delShape(this._lastTipShape.tipShape);
            }
            clearTimeout(this._hidingTicket);
            clearTimeout(this._showingTicket);
            this.zr.un(zrConfig.EVENT.MOUSEMOVE, this._onmousemove);
            this.zr.un(zrConfig.EVENT.GLOBALOUT, this._onglobalout);
            if (this.hasAppend && !!this.dom.firstChild) {
                this.dom.firstChild.removeChild(this._tDom);
            }
            this._tDom = null;
        },
        _encodeHTML: function (source) {
            return String(source).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
    };
    zrUtil.inherits(Tooltip, Base);
    require('../component').define('tooltip', Tooltip);
    return Tooltip;
});define('echarts/component/legend', [
    'require',
    './base',
    'zrender/shape/Text',
    'zrender/shape/Rectangle',
    '../util/shape/Icon',
    '../config',
    'zrender/tool/util',
    'zrender/tool/area',
    '../component'
], function (require) {
    var Base = require('./base');
    var TextShape = require('zrender/shape/Text');
    var RectangleShape = require('zrender/shape/Rectangle');
    var IconShape = require('../util/shape/Icon');
    var ecConfig = require('../config');
    ecConfig.legend = {
        zlevel: 0,
        z: 4,
        show: true,
        orient: 'horizontal',
        x: 'center',
        y: 'top',
        backgroundColor: 'rgba(0,0,0,0)',
        borderColor: '#ccc',
        borderWidth: 0,
        padding: 5,
        itemGap: 10,
        itemWidth: 20,
        itemHeight: 14,
        textStyle: { color: '#333' },
        selectedMode: true
    };
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    function Legend(ecTheme, messageCenter, zr, option, myChart) {
        if (!this.query(option, 'legend.data')) {
            console.error('option.legend.data has not been defined.');
            return;
        }
        Base.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        self._legendSelected = function (param) {
            self.__legendSelected(param);
        };
        self._dispatchHoverLink = function (param) {
            return self.__dispatchHoverLink(param);
        };
        this._colorIndex = 0;
        this._colorMap = {};
        this._selectedMap = {};
        this._hasDataMap = {};
        this.refresh(option);
    }
    Legend.prototype = {
        type: ecConfig.COMPONENT_TYPE_LEGEND,
        _buildShape: function () {
            if (!this.legendOption.show) {
                return;
            }
            this._itemGroupLocation = this._getItemGroupLocation();
            this._buildBackground();
            this._buildItem();
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                this.zr.addShape(this.shapeList[i]);
            }
        },
        _buildItem: function () {
            var data = this.legendOption.data;
            var dataLength = data.length;
            var itemName;
            var itemType;
            var itemShape;
            var textShape;
            var textStyle = this.legendOption.textStyle;
            var dataTextStyle;
            var dataFont;
            var formattedName;
            var zrWidth = this.zr.getWidth();
            var zrHeight = this.zr.getHeight();
            var lastX = this._itemGroupLocation.x;
            var lastY = this._itemGroupLocation.y;
            var itemWidth = this.legendOption.itemWidth;
            var itemHeight = this.legendOption.itemHeight;
            var itemGap = this.legendOption.itemGap;
            var color;
            if (this.legendOption.orient === 'vertical' && this.legendOption.x === 'right') {
                lastX = this._itemGroupLocation.x + this._itemGroupLocation.width - itemWidth;
            }
            for (var i = 0; i < dataLength; i++) {
                dataTextStyle = zrUtil.merge(data[i].textStyle || {}, textStyle);
                dataFont = this.getFont(dataTextStyle);
                itemName = this._getName(data[i]);
                formattedName = this._getFormatterName(itemName);
                if (itemName === '') {
                    if (this.legendOption.orient === 'horizontal') {
                        lastX = this._itemGroupLocation.x;
                        lastY += itemHeight + itemGap;
                    } else {
                        this.legendOption.x === 'right' ? lastX -= this._itemGroupLocation.maxWidth + itemGap : lastX += this._itemGroupLocation.maxWidth + itemGap;
                        lastY = this._itemGroupLocation.y;
                    }
                    continue;
                }
                itemType = data[i].icon || this._getSomethingByName(itemName).type;
                color = this.getColor(itemName);
                if (this.legendOption.orient === 'horizontal') {
                    if (zrWidth - lastX < 200 && itemWidth + 5 + zrArea.getTextWidth(formattedName, dataFont) + (i === dataLength - 1 || data[i + 1] === '' ? 0 : itemGap) >= zrWidth - lastX) {
                        lastX = this._itemGroupLocation.x;
                        lastY += itemHeight + itemGap;
                    }
                } else {
                    if (zrHeight - lastY < 200 && itemHeight + (i === dataLength - 1 || data[i + 1] === '' ? 0 : itemGap) >= zrHeight - lastY) {
                        this.legendOption.x === 'right' ? lastX -= this._itemGroupLocation.maxWidth + itemGap : lastX += this._itemGroupLocation.maxWidth + itemGap;
                        lastY = this._itemGroupLocation.y;
                    }
                }
                itemShape = this._getItemShapeByType(lastX, lastY, itemWidth, itemHeight, this._selectedMap[itemName] && this._hasDataMap[itemName] ? color : '#ccc', itemType, color);
                itemShape._name = itemName;
                itemShape = new IconShape(itemShape);
                textShape = {
                    zlevel: this.getZlevelBase(),
                    z: this.getZBase(),
                    style: {
                        x: lastX + itemWidth + 5,
                        y: lastY + itemHeight / 2,
                        color: this._selectedMap[itemName] ? dataTextStyle.color === 'auto' ? color : dataTextStyle.color : '#ccc',
                        text: formattedName,
                        textFont: dataFont,
                        textBaseline: 'middle'
                    },
                    highlightStyle: {
                        color: color,
                        brushType: 'fill'
                    },
                    hoverable: !!this.legendOption.selectedMode,
                    clickable: !!this.legendOption.selectedMode
                };
                if (this.legendOption.orient === 'vertical' && this.legendOption.x === 'right') {
                    textShape.style.x -= itemWidth + 10;
                    textShape.style.textAlign = 'right';
                }
                textShape._name = itemName;
                textShape = new TextShape(textShape);
                if (this.legendOption.selectedMode) {
                    itemShape.onclick = textShape.onclick = this._legendSelected;
                    itemShape.onmouseover = textShape.onmouseover = this._dispatchHoverLink;
                    itemShape.hoverConnect = textShape.id;
                    textShape.hoverConnect = itemShape.id;
                }
                this.shapeList.push(itemShape);
                this.shapeList.push(textShape);
                if (this.legendOption.orient === 'horizontal') {
                    lastX += itemWidth + 5 + zrArea.getTextWidth(formattedName, dataFont) + itemGap;
                } else {
                    lastY += itemHeight + itemGap;
                }
            }
            if (this.legendOption.orient === 'horizontal' && this.legendOption.x === 'center' && lastY != this._itemGroupLocation.y) {
                this._mLineOptimize();
            }
        },
        _getName: function (data) {
            return typeof data.name != 'undefined' ? data.name : data;
        },
        _getFormatterName: function (itemName) {
            var formatter = this.legendOption.formatter;
            var formattedName;
            if (typeof formatter === 'function') {
                formattedName = formatter.call(this.myChart, itemName);
            } else if (typeof formatter === 'string') {
                formattedName = formatter.replace('{name}', itemName);
            } else {
                formattedName = itemName;
            }
            return formattedName;
        },
        _getFormatterNameFromData: function (data) {
            var itemName = this._getName(data);
            return this._getFormatterName(itemName);
        },
        _mLineOptimize: function () {
            var lineOffsetArray = [];
            var lastX = this._itemGroupLocation.x;
            for (var i = 2, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].style.x === lastX) {
                    lineOffsetArray.push((this._itemGroupLocation.width - (this.shapeList[i - 1].style.x + zrArea.getTextWidth(this.shapeList[i - 1].style.text, this.shapeList[i - 1].style.textFont) - lastX)) / 2);
                } else if (i === l - 1) {
                    lineOffsetArray.push((this._itemGroupLocation.width - (this.shapeList[i].style.x + zrArea.getTextWidth(this.shapeList[i].style.text, this.shapeList[i].style.textFont) - lastX)) / 2);
                }
            }
            var curLineIndex = -1;
            for (var i = 1, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].style.x === lastX) {
                    curLineIndex++;
                }
                if (lineOffsetArray[curLineIndex] === 0) {
                    continue;
                } else {
                    this.shapeList[i].style.x += lineOffsetArray[curLineIndex];
                }
            }
        },
        _buildBackground: function () {
            var padding = this.reformCssArray(this.legendOption.padding);
            this.shapeList.push(new RectangleShape({
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                hoverable: false,
                style: {
                    x: this._itemGroupLocation.x - padding[3],
                    y: this._itemGroupLocation.y - padding[0],
                    width: this._itemGroupLocation.width + padding[3] + padding[1],
                    height: this._itemGroupLocation.height + padding[0] + padding[2],
                    brushType: this.legendOption.borderWidth === 0 ? 'fill' : 'both',
                    color: this.legendOption.backgroundColor,
                    strokeColor: this.legendOption.borderColor,
                    lineWidth: this.legendOption.borderWidth
                }
            }));
        },
        _getItemGroupLocation: function () {
            var data = this.legendOption.data;
            var dataLength = data.length;
            var itemGap = this.legendOption.itemGap;
            var itemWidth = this.legendOption.itemWidth + 5;
            var itemHeight = this.legendOption.itemHeight;
            var textStyle = this.legendOption.textStyle;
            var font = this.getFont(textStyle);
            var totalWidth = 0;
            var totalHeight = 0;
            var padding = this.reformCssArray(this.legendOption.padding);
            var zrWidth = this.zr.getWidth() - padding[1] - padding[3];
            var zrHeight = this.zr.getHeight() - padding[0] - padding[2];
            var temp = 0;
            var maxWidth = 0;
            if (this.legendOption.orient === 'horizontal') {
                totalHeight = itemHeight;
                for (var i = 0; i < dataLength; i++) {
                    if (this._getName(data[i]) === '') {
                        temp -= itemGap;
                        totalWidth = Math.max(totalWidth, temp);
                        totalHeight += itemHeight + itemGap;
                        temp = 0;
                        continue;
                    }
                    var tempTextWidth = zrArea.getTextWidth(this._getFormatterNameFromData(data[i]), data[i].textStyle ? this.getFont(zrUtil.merge(data[i].textStyle || {}, textStyle)) : font);
                    if (temp + itemWidth + tempTextWidth + itemGap > zrWidth) {
                        temp -= itemGap;
                        totalWidth = Math.max(totalWidth, temp);
                        totalHeight += itemHeight + itemGap;
                        temp = 0;
                    } else {
                        temp += itemWidth + tempTextWidth + itemGap;
                        totalWidth = Math.max(totalWidth, temp - itemGap);
                    }
                }
            } else {
                for (var i = 0; i < dataLength; i++) {
                    maxWidth = Math.max(maxWidth, zrArea.getTextWidth(this._getFormatterNameFromData(data[i]), data[i].textStyle ? this.getFont(zrUtil.merge(data[i].textStyle || {}, textStyle)) : font));
                }
                maxWidth += itemWidth;
                totalWidth = maxWidth;
                for (var i = 0; i < dataLength; i++) {
                    if (this._getName(data[i]) === '') {
                        totalWidth += maxWidth + itemGap;
                        temp -= itemGap;
                        totalHeight = Math.max(totalHeight, temp);
                        temp = 0;
                        continue;
                    }
                    if (temp + itemHeight + itemGap > zrHeight) {
                        totalWidth += maxWidth + itemGap;
                        temp -= itemGap;
                        totalHeight = Math.max(totalHeight, temp);
                        temp = 0;
                    } else {
                        temp += itemHeight + itemGap;
                        totalHeight = Math.max(totalHeight, temp - itemGap);
                    }
                }
            }
            zrWidth = this.zr.getWidth();
            zrHeight = this.zr.getHeight();
            var x;
            switch (this.legendOption.x) {
                case 'center':
                    x = Math.floor((zrWidth - totalWidth) / 2);
                    break;
                case 'left':
                    x = padding[3] + this.legendOption.borderWidth;
                    break;
                case 'right':
                    x = zrWidth - totalWidth - padding[1] - padding[3] - this.legendOption.borderWidth * 2;
                    break;
                default:
                    x = this.parsePercent(this.legendOption.x, zrWidth);
                    break;
            }
            var y;
            switch (this.legendOption.y) {
                case 'top':
                    y = padding[0] + this.legendOption.borderWidth;
                    break;
                case 'bottom':
                    y = zrHeight - totalHeight - padding[0] - padding[2] - this.legendOption.borderWidth * 2;
                    break;
                case 'center':
                    y = Math.floor((zrHeight - totalHeight) / 2);
                    break;
                default:
                    y = this.parsePercent(this.legendOption.y, zrHeight);
                    break;
            }
            return {
                x: x,
                y: y,
                width: totalWidth,
                height: totalHeight,
                maxWidth: maxWidth
            };
        },
        _getSomethingByName: function (name) {
            var series = this.option.series;
            var data;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].name === name) {
                    return {
                        type: series[i].type,
                        series: series[i],
                        seriesIndex: i,
                        data: null,
                        dataIndex: -1
                    };
                }
                if (series[i].type === ecConfig.CHART_TYPE_PIE || series[i].type === ecConfig.CHART_TYPE_RADAR || series[i].type === ecConfig.CHART_TYPE_CHORD || series[i].type === ecConfig.CHART_TYPE_FORCE || series[i].type === ecConfig.CHART_TYPE_FUNNEL || series[i].type === ecConfig.CHART_TYPE_TREEMAP) {
                    data = series[i].categories || series[i].data || series[i].nodes;
                    for (var j = 0, k = data.length; j < k; j++) {
                        if (data[j].name === name) {
                            return {
                                type: series[i].type,
                                series: series[i],
                                seriesIndex: i,
                                data: data[j],
                                dataIndex: j
                            };
                        }
                    }
                }
            }
            return {
                type: 'bar',
                series: null,
                seriesIndex: -1,
                data: null,
                dataIndex: -1
            };
        },
        _getItemShapeByType: function (x, y, width, height, color, itemType, defaultColor) {
            var highlightColor = color === '#ccc' ? defaultColor : color;
            var itemShape = {
                zlevel: this.getZlevelBase(),
                z: this.getZBase(),
                style: {
                    iconType: 'legendicon' + itemType,
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    color: color,
                    strokeColor: color,
                    lineWidth: 2
                },
                highlightStyle: {
                    color: highlightColor,
                    strokeColor: highlightColor,
                    lineWidth: 1
                },
                hoverable: this.legendOption.selectedMode,
                clickable: this.legendOption.selectedMode
            };
            var imageLocation;
            if (itemType.match('image')) {
                var imageLocation = itemType.replace(new RegExp('^image:\\/\\/'), '');
                itemType = 'image';
            }
            switch (itemType) {
                case 'line':
                    itemShape.style.brushType = 'stroke';
                    itemShape.highlightStyle.lineWidth = 3;
                    break;
                case 'radar':
                case 'venn':
                case 'treemap':
                case 'scatter':
                    itemShape.highlightStyle.lineWidth = 3;
                    break;
                case 'k':
                    itemShape.style.brushType = 'both';
                    itemShape.highlightStyle.lineWidth = 3;
                    itemShape.highlightStyle.color = itemShape.style.color = this.deepQuery([
                            this.ecTheme,
                            ecConfig
                        ], 'k.itemStyle.normal.color') || '#fff';
                    itemShape.style.strokeColor = color != '#ccc' ? this.deepQuery([
                            this.ecTheme,
                            ecConfig
                        ], 'k.itemStyle.normal.lineStyle.color') || '#ff3200' : color;
                    break;
                case 'image':
                    itemShape.style.iconType = 'image';
                    itemShape.style.image = imageLocation;
                    if (color === '#ccc') {
                        itemShape.style.opacity = 0.5;
                    }
                    break;
            }
            return itemShape;
        },
        __legendSelected: function (param) {
            var itemName = param.target._name;
            if (this.legendOption.selectedMode === 'single') {
                for (var k in this._selectedMap) {
                    this._selectedMap[k] = false;
                }
            }
            this._selectedMap[itemName] = !this._selectedMap[itemName];
            this.messageCenter.dispatch(ecConfig.EVENT.LEGEND_SELECTED, param.event, {
                selected: this._selectedMap,
                target: itemName
            }, this.myChart);
        },
        __dispatchHoverLink: function (param) {
            this.messageCenter.dispatch(ecConfig.EVENT.LEGEND_HOVERLINK, param.event, { target: param.target._name }, this.myChart);
            return;
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption || this.option;
                this.option.legend = this.reformOption(this.option.legend);
                this.legendOption = this.option.legend;
                var data = this.legendOption.data || [];
                var itemName;
                var something;
                var color;
                var queryTarget;
                if (this.legendOption.selected) {
                    for (var k in this.legendOption.selected) {
                        this._selectedMap[k] = typeof this._selectedMap[k] != 'undefined' ? this._selectedMap[k] : this.legendOption.selected[k];
                    }
                }
                for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                    itemName = this._getName(data[i]);
                    if (itemName === '') {
                        continue;
                    }
                    something = this._getSomethingByName(itemName);
                    if (!something.series) {
                        this._hasDataMap[itemName] = false;
                    } else {
                        this._hasDataMap[itemName] = true;
                        if (something.data && (something.type === ecConfig.CHART_TYPE_PIE || something.type === ecConfig.CHART_TYPE_FORCE || something.type === ecConfig.CHART_TYPE_FUNNEL)) {
                            queryTarget = [
                                something.data,
                                something.series
                            ];
                        } else {
                            queryTarget = [something.series];
                        }
                        color = this.getItemStyleColor(this.deepQuery(queryTarget, 'itemStyle.normal.color'), something.seriesIndex, something.dataIndex, something.data);
                        if (color && something.type != ecConfig.CHART_TYPE_K) {
                            this.setColor(itemName, color);
                        }
                        this._selectedMap[itemName] = this._selectedMap[itemName] != null ? this._selectedMap[itemName] : true;
                    }
                }
            }
            this.clear();
            this._buildShape();
        },
        getRelatedAmount: function (name) {
            var amount = 0;
            var series = this.option.series;
            var data;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].name === name) {
                    amount++;
                }
                if (series[i].type === ecConfig.CHART_TYPE_PIE || series[i].type === ecConfig.CHART_TYPE_RADAR || series[i].type === ecConfig.CHART_TYPE_CHORD || series[i].type === ecConfig.CHART_TYPE_FORCE || series[i].type === ecConfig.CHART_TYPE_FUNNEL) {
                    data = series[i].type != ecConfig.CHART_TYPE_FORCE ? series[i].data : series[i].categories;
                    for (var j = 0, k = data.length; j < k; j++) {
                        if (data[j].name === name && data[j].value != '-') {
                            amount++;
                        }
                    }
                }
            }
            return amount;
        },
        setColor: function (legendName, color) {
            this._colorMap[legendName] = color;
        },
        getColor: function (legendName) {
            if (!this._colorMap[legendName]) {
                this._colorMap[legendName] = this.zr.getColor(this._colorIndex++);
            }
            return this._colorMap[legendName];
        },
        hasColor: function (legendName) {
            return this._colorMap[legendName] ? this._colorMap[legendName] : false;
        },
        add: function (name, color) {
            var data = this.legendOption.data;
            for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                if (this._getName(data[i]) === name) {
                    return;
                }
            }
            this.legendOption.data.push(name);
            this.setColor(name, color);
            this._selectedMap[name] = true;
            this._hasDataMap[name] = true;
        },
        del: function (name) {
            var data = this.legendOption.data;
            for (var i = 0, dataLength = data.length; i < dataLength; i++) {
                if (this._getName(data[i]) === name) {
                    return this.legendOption.data.splice(i, 1);
                }
            }
        },
        getItemShape: function (name) {
            if (name == null) {
                return;
            }
            var shape;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                shape = this.shapeList[i];
                if (shape._name === name && shape.type != 'text') {
                    return shape;
                }
            }
        },
        setItemShape: function (name, itemShape) {
            var shape;
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                shape = this.shapeList[i];
                if (shape._name === name && shape.type != 'text') {
                    if (!this._selectedMap[name]) {
                        itemShape.style.color = '#ccc';
                        itemShape.style.strokeColor = '#ccc';
                    }
                    this.zr.modShape(shape.id, itemShape);
                }
            }
        },
        isSelected: function (itemName) {
            if (typeof this._selectedMap[itemName] != 'undefined') {
                return this._selectedMap[itemName];
            } else {
                return true;
            }
        },
        getSelectedMap: function () {
            return this._selectedMap;
        },
        setSelected: function (itemName, selectStatus) {
            if (this.legendOption.selectedMode === 'single') {
                for (var k in this._selectedMap) {
                    this._selectedMap[k] = false;
                }
            }
            this._selectedMap[itemName] = selectStatus;
            this.messageCenter.dispatch(ecConfig.EVENT.LEGEND_SELECTED, null, {
                selected: this._selectedMap,
                target: itemName
            }, this.myChart);
        },
        onlegendSelected: function (param, status) {
            var legendSelected = param.selected;
            for (var itemName in legendSelected) {
                if (this._selectedMap[itemName] != legendSelected[itemName]) {
                    status.needRefresh = true;
                }
                this._selectedMap[itemName] = legendSelected[itemName];
            }
            return;
        }
    };
    var legendIcon = {
        force: function (ctx, style) {
            IconShape.prototype.iconLibrary.circle(ctx, style);
        }
    };
    legendIcon.chord = legendIcon.pie;
    legendIcon.map = legendIcon.bar;
    for (var k in legendIcon) {
        IconShape.prototype.iconLibrary['legendicon' + k] = legendIcon[k];
    }
    zrUtil.inherits(Legend, Base);
    require('../component').define('legend', Legend);
    return Legend;
});define('echarts/util/ecData', [], function () {
    function pack(shape, series, seriesIndex, data, dataIndex, name, special, special2) {
        var value;
        if (typeof data != 'undefined') {
            value = data.value == null ? data : data.value;
        }
        shape._echartsData = {
            '_series': series,
            '_seriesIndex': seriesIndex,
            '_data': data,
            '_dataIndex': dataIndex,
            '_name': name,
            '_value': value,
            '_special': special,
            '_special2': special2
        };
        return shape._echartsData;
    }
    function get(shape, key) {
        var data = shape._echartsData;
        if (!key) {
            return data;
        }
        switch (key) {
            case 'series':
            case 'seriesIndex':
            case 'data':
            case 'dataIndex':
            case 'name':
            case 'value':
            case 'special':
            case 'special2':
                return data && data['_' + key];
        }
        return null;
    }
    function set(shape, key, value) {
        shape._echartsData = shape._echartsData || {};
        switch (key) {
            case 'series':
            case 'seriesIndex':
            case 'data':
            case 'dataIndex':
            case 'name':
            case 'value':
            case 'special':
            case 'special2':
                shape._echartsData['_' + key] = value;
                break;
        }
    }
    function clone(source, target) {
        target._echartsData = {
            '_series': source._echartsData._series,
            '_seriesIndex': source._echartsData._seriesIndex,
            '_data': source._echartsData._data,
            '_dataIndex': source._echartsData._dataIndex,
            '_name': source._echartsData._name,
            '_value': source._echartsData._value,
            '_special': source._echartsData._special,
            '_special2': source._echartsData._special2
        };
    }
    return {
        pack: pack,
        set: set,
        get: get,
        clone: clone
    };
});define('echarts/chart', [], function () {
    var self = {};
    var _chartLibrary = {};
    self.define = function (name, clazz) {
        _chartLibrary[name] = clazz;
        return self;
    };
    self.get = function (name) {
        return _chartLibrary[name];
    };
    return self;
});define('zrender/tool/color', [
    'require',
    '../tool/util'
], function (require) {
    var util = require('../tool/util');
    var _ctx;
    var palette = [
        '#ff9277',
        ' #dddd00',
        ' #ffc877',
        ' #bbe3ff',
        ' #d5ffbb',
        '#bbbbff',
        ' #ddb000',
        ' #b0dd00',
        ' #e2bbff',
        ' #ffbbe3',
        '#ff7777',
        ' #ff9900',
        ' #83dd00',
        ' #77e3ff',
        ' #778fff',
        '#c877ff',
        ' #ff77ab',
        ' #ff6600',
        ' #aa8800',
        ' #77c7ff',
        '#ad77ff',
        ' #ff77ff',
        ' #dd0083',
        ' #777700',
        ' #00aa00',
        '#0088aa',
        ' #8400dd',
        ' #aa0088',
        ' #dd0000',
        ' #772e00'
    ];
    var _palette = palette;
    var highlightColor = 'rgba(255,255,0,0.5)';
    var _highlightColor = highlightColor;
    var colorRegExp = /^\s*((#[a-f\d]{6})|(#[a-f\d]{3})|rgba?\(\s*([\d\.]+%?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+%?)?)\s*\)|hsba?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+)?)%?\s*\)|hsla?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+)?)%?\s*\))\s*$/i;
    var _nameColors = {
        aliceblue: '#f0f8ff',
        antiquewhite: '#faebd7',
        aqua: '#0ff',
        aquamarine: '#7fffd4',
        azure: '#f0ffff',
        beige: '#f5f5dc',
        bisque: '#ffe4c4',
        black: '#000',
        blanchedalmond: '#ffebcd',
        blue: '#00f',
        blueviolet: '#8a2be2',
        brown: '#a52a2a',
        burlywood: '#deb887',
        cadetblue: '#5f9ea0',
        chartreuse: '#7fff00',
        chocolate: '#d2691e',
        coral: '#ff7f50',
        cornflowerblue: '#6495ed',
        cornsilk: '#fff8dc',
        crimson: '#dc143c',
        cyan: '#0ff',
        darkblue: '#00008b',
        darkcyan: '#008b8b',
        darkgoldenrod: '#b8860b',
        darkgray: '#a9a9a9',
        darkgrey: '#a9a9a9',
        darkgreen: '#006400',
        darkkhaki: '#bdb76b',
        darkmagenta: '#8b008b',
        darkolivegreen: '#556b2f',
        darkorange: '#ff8c00',
        darkorchid: '#9932cc',
        darkred: '#8b0000',
        darksalmon: '#e9967a',
        darkseagreen: '#8fbc8f',
        darkslateblue: '#483d8b',
        darkslategray: '#2f4f4f',
        darkslategrey: '#2f4f4f',
        darkturquoise: '#00ced1',
        darkviolet: '#9400d3',
        deeppink: '#ff1493',
        deepskyblue: '#00bfff',
        dimgray: '#696969',
        dimgrey: '#696969',
        dodgerblue: '#1e90ff',
        firebrick: '#b22222',
        floralwhite: '#fffaf0',
        forestgreen: '#228b22',
        fuchsia: '#f0f',
        gainsboro: '#dcdcdc',
        ghostwhite: '#f8f8ff',
        gold: '#ffd700',
        goldenrod: '#daa520',
        gray: '#808080',
        grey: '#808080',
        green: '#008000',
        greenyellow: '#adff2f',
        honeydew: '#f0fff0',
        hotpink: '#ff69b4',
        indianred: '#cd5c5c',
        indigo: '#4b0082',
        ivory: '#fffff0',
        khaki: '#f0e68c',
        lavender: '#e6e6fa',
        lavenderblush: '#fff0f5',
        lawngreen: '#7cfc00',
        lemonchiffon: '#fffacd',
        lightblue: '#add8e6',
        lightcoral: '#f08080',
        lightcyan: '#e0ffff',
        lightgoldenrodyellow: '#fafad2',
        lightgray: '#d3d3d3',
        lightgrey: '#d3d3d3',
        lightgreen: '#90ee90',
        lightpink: '#ffb6c1',
        lightsalmon: '#ffa07a',
        lightseagreen: '#20b2aa',
        lightskyblue: '#87cefa',
        lightslategray: '#789',
        lightslategrey: '#789',
        lightsteelblue: '#b0c4de',
        lightyellow: '#ffffe0',
        lime: '#0f0',
        limegreen: '#32cd32',
        linen: '#faf0e6',
        magenta: '#f0f',
        maroon: '#800000',
        mediumaquamarine: '#66cdaa',
        mediumblue: '#0000cd',
        mediumorchid: '#ba55d3',
        mediumpurple: '#9370d8',
        mediumseagreen: '#3cb371',
        mediumslateblue: '#7b68ee',
        mediumspringgreen: '#00fa9a',
        mediumturquoise: '#48d1cc',
        mediumvioletred: '#c71585',
        midnightblue: '#191970',
        mintcream: '#f5fffa',
        mistyrose: '#ffe4e1',
        moccasin: '#ffe4b5',
        navajowhite: '#ffdead',
        navy: '#000080',
        oldlace: '#fdf5e6',
        olive: '#808000',
        olivedrab: '#6b8e23',
        orange: '#ffa500',
        orangered: '#ff4500',
        orchid: '#da70d6',
        palegoldenrod: '#eee8aa',
        palegreen: '#98fb98',
        paleturquoise: '#afeeee',
        palevioletred: '#d87093',
        papayawhip: '#ffefd5',
        peachpuff: '#ffdab9',
        peru: '#cd853f',
        pink: '#ffc0cb',
        plum: '#dda0dd',
        powderblue: '#b0e0e6',
        purple: '#800080',
        red: '#f00',
        rosybrown: '#bc8f8f',
        royalblue: '#4169e1',
        saddlebrown: '#8b4513',
        salmon: '#fa8072',
        sandybrown: '#f4a460',
        seagreen: '#2e8b57',
        seashell: '#fff5ee',
        sienna: '#a0522d',
        silver: '#c0c0c0',
        skyblue: '#87ceeb',
        slateblue: '#6a5acd',
        slategray: '#708090',
        slategrey: '#708090',
        snow: '#fffafa',
        springgreen: '#00ff7f',
        steelblue: '#4682b4',
        tan: '#d2b48c',
        teal: '#008080',
        thistle: '#d8bfd8',
        tomato: '#ff6347',
        turquoise: '#40e0d0',
        violet: '#ee82ee',
        wheat: '#f5deb3',
        white: '#fff',
        whitesmoke: '#f5f5f5',
        yellow: '#ff0',
        yellowgreen: '#9acd32'
    };
    function customPalette(userPalete) {
        palette = userPalete;
    }
    function resetPalette() {
        palette = _palette;
    }
    function getColor(idx, userPalete) {
        idx = idx | 0;
        userPalete = userPalete || palette;
        return userPalete[idx % userPalete.length];
    }
    function customHighlight(userHighlightColor) {
        highlightColor = userHighlightColor;
    }
    function resetHighlight() {
        _highlightColor = highlightColor;
    }
    function getHighlightColor() {
        return highlightColor;
    }
    function getRadialGradient(x0, y0, r0, x1, y1, r1, colorList) {
        if (!_ctx) {
            _ctx = util.getContext();
        }
        var gradient = _ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        for (var i = 0, l = colorList.length; i < l; i++) {
            gradient.addColorStop(colorList[i][0], colorList[i][1]);
        }
        gradient.__nonRecursion = true;
        return gradient;
    }
    function getLinearGradient(x0, y0, x1, y1, colorList) {
        if (!_ctx) {
            _ctx = util.getContext();
        }
        var gradient = _ctx.createLinearGradient(x0, y0, x1, y1);
        for (var i = 0, l = colorList.length; i < l; i++) {
            gradient.addColorStop(colorList[i][0], colorList[i][1]);
        }
        gradient.__nonRecursion = true;
        return gradient;
    }
    function getStepColors(start, end, step) {
        start = toRGBA(start);
        end = toRGBA(end);
        start = getData(start);
        end = getData(end);
        var colors = [];
        var stepR = (end[0] - start[0]) / step;
        var stepG = (end[1] - start[1]) / step;
        var stepB = (end[2] - start[2]) / step;
        var stepA = (end[3] - start[3]) / step;
        for (var i = 0, r = start[0], g = start[1], b = start[2], a = start[3]; i < step; i++) {
            colors[i] = toColor([
                adjust(Math.floor(r), [
                    0,
                    255
                ]),
                adjust(Math.floor(g), [
                    0,
                    255
                ]),
                adjust(Math.floor(b), [
                    0,
                    255
                ]),
                a.toFixed(4) - 0
            ], 'rgba');
            r += stepR;
            g += stepG;
            b += stepB;
            a += stepA;
        }
        r = end[0];
        g = end[1];
        b = end[2];
        a = end[3];
        colors[i] = toColor([
            r,
            g,
            b,
            a
        ], 'rgba');
        return colors;
    }
    function getGradientColors(colors, step) {
        var ret = [];
        var len = colors.length;
        if (step === undefined) {
            step = 20;
        }
        if (len === 1) {
            ret = getStepColors(colors[0], colors[0], step);
        } else if (len > 1) {
            for (var i = 0, n = len - 1; i < n; i++) {
                var steps = getStepColors(colors[i], colors[i + 1], step);
                if (i < n - 1) {
                    steps.pop();
                }
                ret = ret.concat(steps);
            }
        }
        return ret;
    }
    function toColor(data, format) {
        format = format || 'rgb';
        if (data && (data.length === 3 || data.length === 4)) {
            data = map(data, function (c) {
                return c > 1 ? Math.ceil(c) : c;
            });
            if (format.indexOf('hex') > -1) {
                return '#' + ((1 << 24) + (data[0] << 16) + (data[1] << 8) + +data[2]).toString(16).slice(1);
            } else if (format.indexOf('hs') > -1) {
                var sx = map(data.slice(1, 3), function (c) {
                    return c + '%';
                });
                data[1] = sx[0];
                data[2] = sx[1];
            }
            if (format.indexOf('a') > -1) {
                if (data.length === 3) {
                    data.push(1);
                }
                data[3] = adjust(data[3], [
                    0,
                    1
                ]);
                return format + '(' + data.slice(0, 4).join(',') + ')';
            }
            return format + '(' + data.slice(0, 3).join(',') + ')';
        }
    }
    function toArray(color) {
        color = trim(color);
        if (color.indexOf('rgba') < 0) {
            color = toRGBA(color);
        }
        var data = [];
        var i = 0;
        color.replace(/[\d.]+/g, function (n) {
            if (i < 3) {
                n = n | 0;
            } else {
                n = +n;
            }
            data[i++] = n;
        });
        return data;
    }
    function convert(color, format) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var data = getData(color);
        var alpha = data[3];
        if (typeof alpha === 'undefined') {
            alpha = 1;
        }
        if (color.indexOf('hsb') > -1) {
            data = _HSV_2_RGB(data);
        } else if (color.indexOf('hsl') > -1) {
            data = _HSL_2_RGB(data);
        }
        if (format.indexOf('hsb') > -1 || format.indexOf('hsv') > -1) {
            data = _RGB_2_HSB(data);
        } else if (format.indexOf('hsl') > -1) {
            data = _RGB_2_HSL(data);
        }
        data[3] = alpha;
        return toColor(data, format);
    }
    function toRGBA(color) {
        return convert(color, 'rgba');
    }
    function toRGB(color) {
        return convert(color, 'rgb');
    }
    function toHex(color) {
        return convert(color, 'hex');
    }
    function toHSVA(color) {
        return convert(color, 'hsva');
    }
    function toHSV(color) {
        return convert(color, 'hsv');
    }
    function toHSBA(color) {
        return convert(color, 'hsba');
    }
    function toHSB(color) {
        return convert(color, 'hsb');
    }
    function toHSLA(color) {
        return convert(color, 'hsla');
    }
    function toHSL(color) {
        return convert(color, 'hsl');
    }
    function toName(color) {
        for (var key in _nameColors) {
            if (toHex(_nameColors[key]) === toHex(color)) {
                return key;
            }
        }
        return null;
    }
    function trim(color) {
        return String(color).replace(/\s+/g, '');
    }
    function normalize(color) {
        if (_nameColors[color]) {
            color = _nameColors[color];
        }
        color = trim(color);
        color = color.replace(/hsv/i, 'hsb');
        if (/^#[\da-f]{3}$/i.test(color)) {
            color = parseInt(color.slice(1), 16);
            var r = (color & 3840) << 8;
            var g = (color & 240) << 4;
            var b = color & 15;
            color = '#' + ((1 << 24) + (r << 4) + r + (g << 4) + g + (b << 4) + b).toString(16).slice(1);
        }
        return color;
    }
    function lift(color, level) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var direct = level > 0 ? 1 : -1;
        if (typeof level === 'undefined') {
            level = 0;
        }
        level = Math.abs(level) > 1 ? 1 : Math.abs(level);
        color = toRGB(color);
        var data = getData(color);
        for (var i = 0; i < 3; i++) {
            if (direct === 1) {
                data[i] = data[i] * (1 - level) | 0;
            } else {
                data[i] = (255 - data[i]) * level + data[i] | 0;
            }
        }
        return 'rgb(' + data.join(',') + ')';
    }
    function reverse(color) {
        if (!isCalculableColor(color)) {
            return color;
        }
        var data = getData(toRGBA(color));
        data = map(data, function (c) {
            return 255 - c;
        });
        return toColor(data, 'rgb');
    }
    function mix(color1, color2, weight) {
        if (!isCalculableColor(color1) || !isCalculableColor(color2)) {
            return color1;
        }
        if (typeof weight === 'undefined') {
            weight = 0.5;
        }
        weight = 1 - adjust(weight, [
                0,
                1
            ]);
        var w = weight * 2 - 1;
        var data1 = getData(toRGBA(color1));
        var data2 = getData(toRGBA(color2));
        var d = data1[3] - data2[3];
        var weight1 = ((w * d === -1 ? w : (w + d) / (1 + w * d)) + 1) / 2;
        var weight2 = 1 - weight1;
        var data = [];
        for (var i = 0; i < 3; i++) {
            data[i] = data1[i] * weight1 + data2[i] * weight2;
        }
        var alpha = data1[3] * weight + data2[3] * (1 - weight);
        alpha = Math.max(0, Math.min(1, alpha));
        if (data1[3] === 1 && data2[3] === 1) {
            return toColor(data, 'rgb');
        }
        data[3] = alpha;
        return toColor(data, 'rgba');
    }
    function random() {
        return '#' + (Math.random().toString(16) + '0000').slice(2, 8);
    }
    function getData(color) {
        color = normalize(color);
        var r = color.match(colorRegExp);
        if (r === null) {
            throw new Error('The color format error');
        }
        var d;
        var a;
        var data = [];
        var rgb;
        if (r[2]) {
            d = r[2].replace('#', '').split('');
            rgb = [
                d[0] + d[1],
                d[2] + d[3],
                d[4] + d[5]
            ];
            data = map(rgb, function (c) {
                return adjust(parseInt(c, 16), [
                    0,
                    255
                ]);
            });
        } else if (r[4]) {
            var rgba = r[4].split(',');
            a = rgba[3];
            rgb = rgba.slice(0, 3);
            data = map(rgb, function (c) {
                c = Math.floor(c.indexOf('%') > 0 ? parseInt(c, 0) * 2.55 : c);
                return adjust(c, [
                    0,
                    255
                ]);
            });
            if (typeof a !== 'undefined') {
                data.push(adjust(parseFloat(a), [
                    0,
                    1
                ]));
            }
        } else if (r[5] || r[6]) {
            var hsxa = (r[5] || r[6]).split(',');
            var h = parseInt(hsxa[0], 0) / 360;
            var s = hsxa[1];
            var x = hsxa[2];
            a = hsxa[3];
            data = map([
                s,
                x
            ], function (c) {
                return adjust(parseFloat(c) / 100, [
                    0,
                    1
                ]);
            });
            data.unshift(h);
            if (typeof a !== 'undefined') {
                data.push(adjust(parseFloat(a), [
                    0,
                    1
                ]));
            }
        }
        return data;
    }
    function alpha(color, a) {
        if (!isCalculableColor(color)) {
            return color;
        }
        if (a === null) {
            a = 1;
        }
        var data = getData(toRGBA(color));
        data[3] = adjust(Number(a).toFixed(4), [
            0,
            1
        ]);
        return toColor(data, 'rgba');
    }
    function map(array, fun) {
        if (typeof fun !== 'function') {
            throw new TypeError();
        }
        var len = array ? array.length : 0;
        for (var i = 0; i < len; i++) {
            array[i] = fun(array[i]);
        }
        return array;
    }
    function adjust(value, region) {
        if (value <= region[0]) {
            value = region[0];
        } else if (value >= region[1]) {
            value = region[1];
        }
        return value;
    }
    function isCalculableColor(color) {
        return color instanceof Array || typeof color === 'string';
    }
    function _HSV_2_RGB(data) {
        var H = data[0];
        var S = data[1];
        var V = data[2];
        var R;
        var G;
        var B;
        if (S === 0) {
            R = V * 255;
            G = V * 255;
            B = V * 255;
        } else {
            var h = H * 6;
            if (h === 6) {
                h = 0;
            }
            var i = h | 0;
            var v1 = V * (1 - S);
            var v2 = V * (1 - S * (h - i));
            var v3 = V * (1 - S * (1 - (h - i)));
            var r = 0;
            var g = 0;
            var b = 0;
            if (i === 0) {
                r = V;
                g = v3;
                b = v1;
            } else if (i === 1) {
                r = v2;
                g = V;
                b = v1;
            } else if (i === 2) {
                r = v1;
                g = V;
                b = v3;
            } else if (i === 3) {
                r = v1;
                g = v2;
                b = V;
            } else if (i === 4) {
                r = v3;
                g = v1;
                b = V;
            } else {
                r = V;
                g = v1;
                b = v2;
            }
            R = r * 255;
            G = g * 255;
            B = b * 255;
        }
        return [
            R,
            G,
            B
        ];
    }
    function _HSL_2_RGB(data) {
        var H = data[0];
        var S = data[1];
        var L = data[2];
        var R;
        var G;
        var B;
        if (S === 0) {
            R = L * 255;
            G = L * 255;
            B = L * 255;
        } else {
            var v2;
            if (L < 0.5) {
                v2 = L * (1 + S);
            } else {
                v2 = L + S - S * L;
            }
            var v1 = 2 * L - v2;
            R = 255 * _HUE_2_RGB(v1, v2, H + 1 / 3);
            G = 255 * _HUE_2_RGB(v1, v2, H);
            B = 255 * _HUE_2_RGB(v1, v2, H - 1 / 3);
        }
        return [
            R,
            G,
            B
        ];
    }
    function _HUE_2_RGB(v1, v2, vH) {
        if (vH < 0) {
            vH += 1;
        }
        if (vH > 1) {
            vH -= 1;
        }
        if (6 * vH < 1) {
            return v1 + (v2 - v1) * 6 * vH;
        }
        if (2 * vH < 1) {
            return v2;
        }
        if (3 * vH < 2) {
            return v1 + (v2 - v1) * (2 / 3 - vH) * 6;
        }
        return v1;
    }
    function _RGB_2_HSB(data) {
        var R = data[0] / 255;
        var G = data[1] / 255;
        var B = data[2] / 255;
        var vMin = Math.min(R, G, B);
        var vMax = Math.max(R, G, B);
        var delta = vMax - vMin;
        var V = vMax;
        var H;
        var S;
        if (delta === 0) {
            H = 0;
            S = 0;
        } else {
            S = delta / vMax;
            var deltaR = ((vMax - R) / 6 + delta / 2) / delta;
            var deltaG = ((vMax - G) / 6 + delta / 2) / delta;
            var deltaB = ((vMax - B) / 6 + delta / 2) / delta;
            if (R === vMax) {
                H = deltaB - deltaG;
            } else if (G === vMax) {
                H = 1 / 3 + deltaR - deltaB;
            } else if (B === vMax) {
                H = 2 / 3 + deltaG - deltaR;
            }
            if (H < 0) {
                H += 1;
            }
            if (H > 1) {
                H -= 1;
            }
        }
        H = H * 360;
        S = S * 100;
        V = V * 100;
        return [
            H,
            S,
            V
        ];
    }
    function _RGB_2_HSL(data) {
        var R = data[0] / 255;
        var G = data[1] / 255;
        var B = data[2] / 255;
        var vMin = Math.min(R, G, B);
        var vMax = Math.max(R, G, B);
        var delta = vMax - vMin;
        var L = (vMax + vMin) / 2;
        var H;
        var S;
        if (delta === 0) {
            H = 0;
            S = 0;
        } else {
            if (L < 0.5) {
                S = delta / (vMax + vMin);
            } else {
                S = delta / (2 - vMax - vMin);
            }
            var deltaR = ((vMax - R) / 6 + delta / 2) / delta;
            var deltaG = ((vMax - G) / 6 + delta / 2) / delta;
            var deltaB = ((vMax - B) / 6 + delta / 2) / delta;
            if (R === vMax) {
                H = deltaB - deltaG;
            } else if (G === vMax) {
                H = 1 / 3 + deltaR - deltaB;
            } else if (B === vMax) {
                H = 2 / 3 + deltaG - deltaR;
            }
            if (H < 0) {
                H += 1;
            }
            if (H > 1) {
                H -= 1;
            }
        }
        H = H * 360;
        S = S * 100;
        L = L * 100;
        return [
            H,
            S,
            L
        ];
    }
    return {
        customPalette: customPalette,
        resetPalette: resetPalette,
        getColor: getColor,
        getHighlightColor: getHighlightColor,
        customHighlight: customHighlight,
        resetHighlight: resetHighlight,
        getRadialGradient: getRadialGradient,
        getLinearGradient: getLinearGradient,
        getGradientColors: getGradientColors,
        getStepColors: getStepColors,
        reverse: reverse,
        mix: mix,
        lift: lift,
        trim: trim,
        random: random,
        toRGB: toRGB,
        toRGBA: toRGBA,
        toHex: toHex,
        toHSL: toHSL,
        toHSLA: toHSLA,
        toHSB: toHSB,
        toHSBA: toHSBA,
        toHSV: toHSV,
        toHSVA: toHSVA,
        toName: toName,
        toColor: toColor,
        toArray: toArray,
        alpha: alpha,
        getData: getData
    };
});define('zrender/shape/Image', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var ZImage = function (options) {
        Base.call(this, options);
    };
    ZImage.prototype = {
        type: 'image',
        brush: function (ctx, isHighlight, refreshNextFrame) {
            var style = this.style || {};
            // if (isHighlight) {
            //     style = this.getHighlightStyle(style, this.highlightStyle || {});
            // }  //deleted by jswang
            var image = style.image;
            var self = this;
            if (!this._imageCache) {
                this._imageCache = {};
            }
            // if (typeof image === 'string') {   //deleted by jswang
            var src = image;
            if (this._imageCache[src]) {
                image = this._imageCache[src];
            } else {
                image = new Image();
                image.onload = function () {
                    image.onload = null;
                    self.modSelf();
                    refreshNextFrame();
                };
                image.src = src;
                this._imageCache[src] = image;
            }
            // }
            if (image) {
                //deleted by jswang
                // if (image.nodeName.toUpperCase() == 'IMG') {
                //     if (window.ActiveXObject) {
                //         if (image.readyState != 'complete') {
                //             return;
                //         }
                //     } else {
                if (!image.complete) {
                    return;
                }
                //     }
                // }
                var width = style.width || image.width;
                var height = style.height || image.height;
                var x = style.x;
                var y = style.y;
                if (!image.width || !image.height) {
                    return;
                }
                ctx.save();
                // this.doClip(ctx);    //deleted by jswang
                this.setContext(ctx, style);
                this.setTransform(ctx);
                ctx.drawImage(image, x, y, width, height);
                if (!style.width) {
                    style.width = width;
                }
                if (!style.height) {
                    style.height = height;
                }
                if (!this.style.width) {
                    this.style.width = width;
                }
                if (!this.style.height) {
                    this.style.height = height;
                }
                //added by jswang start
                if(!this.noText) {
                    this.drawText(ctx, style, this.style);
                }
                // added by jswang end
                ctx.restore();
            }
        },
        getRect: function (style) {
            return {
                x: style.x,
                y: style.y,
                width: style.width,
                height: style.height
            };
        },
        clearCache: function () {
            this._imageCache = {};
        }
    };
    require('../tool/util').inherits(ZImage, Base);
    return ZImage;
});define('zrender/loadingEffect/Bar', [
    'require',
    './Base',
    '../tool/util',
    '../tool/color',
    '../shape/Rectangle'
], function (require) {
    var Base = require('./Base');
    var util = require('../tool/util');
    var zrColor = require('../tool/color');
    var RectangleShape = require('../shape/Rectangle');
    function Bar(options) {
        Base.call(this, options);
    }
    util.inherits(Bar, Base);
    Bar.prototype._start = function (addShapeHandle, refreshHandle) {
        var options = util.merge(this.options, {
            textStyle: { color: '#888' },
            backgroundColor: 'rgba(250, 250, 250, 0.8)',
            effectOption: {
                x: 0,
                y: this.canvasHeight / 2 - 30,
                width: this.canvasWidth,
                height: 5,
                brushType: 'fill',
                timeInterval: 100
            }
        });
        var textShape = this.createTextShape(options.textStyle);
        var background = this.createBackgroundShape(options.backgroundColor);
        var effectOption = options.effectOption;
        var barShape = new RectangleShape({ highlightStyle: util.clone(effectOption) });
        barShape.highlightStyle.color = effectOption.color || zrColor.getLinearGradient(effectOption.x, effectOption.y, effectOption.x + effectOption.width, effectOption.y + effectOption.height, [
                [
                    0,
                    '#ff6400'
                ],
                [
                    0.5,
                    '#ffe100'
                ],
                [
                    1,
                    '#b1ff00'
                ]
            ]);
        if (options.progress != null) {
            addShapeHandle(background);
            barShape.highlightStyle.width = this.adjust(options.progress, [
                    0,
                    1
                ]) * options.effectOption.width;
            addShapeHandle(barShape);
            addShapeHandle(textShape);
            refreshHandle();
            return;
        } else {
            barShape.highlightStyle.width = 0;
            return setInterval(function () {
                addShapeHandle(background);
                if (barShape.highlightStyle.width < effectOption.width) {
                    barShape.highlightStyle.width += 8;
                } else {
                    barShape.highlightStyle.width = 0;
                }
                addShapeHandle(barShape);
                addShapeHandle(textShape);
                refreshHandle();
            }, effectOption.timeInterval);
        }
    };
    return Bar;
});define('zrender/mixin/Eventful', ['require'], function (require) {
    var Eventful = function () {
        this._handlers = {};
    };
    Eventful.prototype.one = function (event, handler, context) {
        var _h = this._handlers;
        if (!handler || !event) {
            return this;
        }
        if (!_h[event]) {
            _h[event] = [];
        }
        _h[event].push({
            h: handler,
            one: true,
            ctx: context || this
        });
        return this;
    };
    Eventful.prototype.bind = function (event, handler, context) {
        var _h = this._handlers;
        if (!handler || !event) {
            return this;
        }
        if (!_h[event]) {
            _h[event] = [];
        }
        _h[event].push({
            h: handler,
            one: false,
            ctx: context || this
        });
        return this;
    };
    Eventful.prototype.unbind = function (event, handler) {
        var _h = this._handlers;
        if (!event) {
            this._handlers = {};
            return this;
        }
        if (handler) {
            if (_h[event]) {
                var newList = [];
                for (var i = 0, l = _h[event].length; i < l; i++) {
                    if (_h[event][i]['h'] != handler) {
                        newList.push(_h[event][i]);
                    }
                }
                _h[event] = newList;
            }
            if (_h[event] && _h[event].length === 0) {
                delete _h[event];
            }
        } else {
            delete _h[event];
        }
        return this;
    };
    Eventful.prototype.dispatch = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;
            if (argLen > 3) {
                args = Array.prototype.slice.call(args, 1);
            }
            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                switch (argLen) {
                    case 1:
                        _h[i]['h'].call(_h[i]['ctx']);
                        break;
                    case 2:
                        _h[i]['h'].call(_h[i]['ctx'], args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(_h[i]['ctx'], args[1], args[2]);
                        break;
                    default:
                        _h[i]['h'].apply(_h[i]['ctx'], args);
                        break;
                }
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                } else {
                    i++;
                }
            }
        }
        return this;
    };
    Eventful.prototype.dispatchWithContext = function (type) {
        if (this._handlers[type]) {
            var args = arguments;
            var argLen = args.length;
            if (argLen > 4) {
                args = Array.prototype.slice.call(args, 1, args.length - 1);
            }
            var ctx = args[args.length - 1];
            var _h = this._handlers[type];
            var len = _h.length;
            for (var i = 0; i < len;) {
                switch (argLen) {
                    case 1:
                        _h[i]['h'].call(ctx);
                        break;
                    case 2:
                        _h[i]['h'].call(ctx, args[1]);
                        break;
                    case 3:
                        _h[i]['h'].call(ctx, args[1], args[2]);
                        break;
                    default:
                        _h[i]['h'].apply(ctx, args);
                        break;
                }
                if (_h[i]['one']) {
                    _h.splice(i, 1);
                    len--;
                } else {
                    i++;
                }
            }
        }
        return this;
    };
    return Eventful;
});define('zrender/tool/log', [
    'require',
    '../config'
], function (require) {
    var config = require('../config');
    return function () {
        if (config.debugMode === 0) {
            return;
        } else if (config.debugMode == 1) {
            for (var k in arguments) {
                throw new Error(arguments[k]);
            }
        } else if (config.debugMode > 1) {
            for (var k in arguments) {
                console.log(arguments[k]);
            }
        }
    };
});define('zrender/tool/guid', [], function () {
    var idStart = 2311;
    return function () {
        return 'zrender__' + idStart++;
    };
});define('zrender/Handler', [
    'require',
    './config',
    './tool/env',
    './tool/event',
    './tool/util',
    './tool/vector',
    './tool/matrix',
    './mixin/Eventful'
], function (require) {
    'use strict';
    var config = require('./config');
    var env = require('./tool/env');
    var eventTool = require('./tool/event');
    var util = require('./tool/util');
    var vec2 = require('./tool/vector');
    var mat2d = require('./tool/matrix');
    var EVENT = config.EVENT;
    var Eventful = require('./mixin/Eventful');
    var domHandlerNames = [
        'resize',
        'click',
        'dblclick',
        'contextmenu',
        'mousewheel',
        'mousemove',
        'mouseout',
        'mouseup',
        'mousedown',
        'touchstart',
        'touchend',
        'touchmove'
    ];
    /* added by wwtang @ 2016.12.26  begin */
    var isZRenderElement = function (event) {
        event = event || window.event;
        var target = event.toElement || event.relatedTarget || event.srcElement || event.target;

        // 处理鼠标事件异常
        var flag = typeof target.className.match != 'function' ? true : target.className.match(config.elementClassName);

        return target && flag;
    };
    /* added by wwtang @ 2016.12.26  end */
    var domHandlers = {
        resize: function (event) {
            event = event || window.event;
            this._lastHover = null;
            this._isMouseDown = 0;
            this.dispatch(EVENT.RESIZE, event);
        },
        click: function (event, manually) {/* added by wwtang @ 2016.12.26 */
            if (!isZRenderElement(event) && !manually) {
                return;
            }
            event = this._zrenderEventFixed(event);
            var _lastHover = this._lastHover;
            if (_lastHover && _lastHover.clickable || !_lastHover) {
                if (this._clickThreshold < 5) {
                    this._dispatchAgency(_lastHover, EVENT.CLICK, event);
                }
            }
            this._mousemoveHandler(event, 'click');
        },
        dblclick: function (event, manually) {
            event = event || window.event;
            event = this._zrenderEventFixed(event);
            var _lastHover = this._lastHover;
            if (_lastHover && _lastHover.clickable || !_lastHover) {
                if (this._clickThreshold < 5) {
                    this._dispatchAgency(_lastHover, EVENT.DBLCLICK, event);
                }
            }
            this._mousemoveHandler(event, 'dblclick');
        },
        contextmenu: function (event, manually) {
            if (!isZRenderElement(event) && !manually) {
                return;
            }
            event = this._zrenderEventFixed(event);
            var _lastHover = this._lastHover;
            if (_lastHover && _lastHover.clickable || !_lastHover) {
                if (this._clickThreshold < 5) {
                    this._dispatchAgency(_lastHover, EVENT.CONTEXTMENU, event);
                }
            }
            this._mousemoveHandler(event, 'contextmenu');
        },
        mousewheel: function (event, manually) {
            event = this._zrenderEventFixed(event);
            var delta = event.wheelDelta || -event.detail;
            var scale = delta > 0 ? 1.1 : 1 / 1.1;
            var needsRefresh = false;
            var mouseX = this._mouseX;
            var mouseY = this._mouseY;
            var $this = this;
            this.painter.eachBuildinLayer(function (layer) {
                var pos = layer.position;
                if (layer.zoomable) {
                    layer.__zoom = layer.__zoom || 1;
                    var newZoom = layer.__zoom;
                    newZoom *= scale;
                    newZoom = Math.max(Math.min(layer.maxZoom, newZoom), layer.minZoom);

                    /* added by wwtang @ 2016.12.26  begin */
                    if(newZoom >= 3.0 || newZoom <= 0.2){
                        return false;
                    }
                    /* added by wwtang @ 2016.12.26  end */
                    scale = newZoom / layer.__zoom;
                    layer.__zoom = newZoom;
                    pos[0] -= (mouseX - pos[0]) * (scale - 1);
                    pos[1] -= (mouseY - pos[1]) * (scale - 1);
                    layer.scale[0] *= scale;
                    layer.scale[1] *= scale;
                    layer.dirty = true;
                    needsRefresh = true;
                    eventTool.stop(event);
                    // $slider.next().removeClass('hide'); /* added by myyao @ 2017.02.07 */
                }
            });
            //added by jswang begin
            //点大于200时，缩放不显示文字
            if(this.elementsLength > 200) {
                this.painter.noText = true;
                clearTimeout($this.timer);
                if (needsRefresh) {
                    this.painter.refresh();
                }
                this.timer = setTimeout(function(){
                    $this.painter.noText = false;
                    $this.painter.refresh(null, true);
                }, 200);
            }else {
                if (needsRefresh) {
                    this.painter.refresh();
                }
            }
            //added by jswang end
            this._dispatchAgency(this._lastHover, EVENT.MOUSEWHEEL, event);
            this._mousemoveHandler(event, 'mousewheel');
        },
        mousemove: function (event, manually) {
            if (this.painter.isLoading()) {
                return;
            }
            event = this._zrenderEventFixed(event);
            this._lastX = this._mouseX;
            this._lastY = this._mouseY;
            this._mouseX = eventTool.getX(event);
            this._mouseY = eventTool.getY(event);
            var dx = this._mouseX - this._lastX;
            var dy = this._mouseY - this._lastY;
            this._processDragStart(event);
            this._hasfound = 0;
            this._event = event;
            this._iterateAndFindHover();
            if (!this._hasfound) {
                if (!this._draggingTarget || this._lastHover && this._lastHover != this._draggingTarget) {
                    this._processOutShape(event);
                    this._processDragLeave(event);
                }
                this._lastHover = null;
                this.storage.delHover();
                this.painter.clearHover();
            }
            var cursor = 'default';
            var that = this;
            if (this._draggingTarget) {
                /* modified by jswang begin */
                var scale = this.painter.getLayer(this._draggingTarget.zlevel).scale;
                //单点拖拽
                this.storage.drift(this._draggingTarget.id, dx / scale[0], dy / scale[1]);
                //多点拖拽
                this.storage._multiTargets && this.storage._multiTargets.forEach(function(shape){
                    that.storage.drift(shape.id, dx / scale[0], dy / scale[1]);
                })

                this._draggingTarget.modSelf();
                this.storage.addHover(this._draggingTarget);
                //需要分层渲染的shape添加至hover层
                this.storage._hoveredShapes && this.storage._hoveredShapes.forEach(function(shape){
                    shape.modSelf();
                    that.storage.addHover(shape);
                })
                /*modified by jswang end*/
                this._clickThreshold++;
            } else if (this._isMouseDown) {
                var needsRefresh = false;
                this.painter.eachBuildinLayer(function (layer) {
                    if (layer.panable) {
                        cursor = 'move';
                        layer.position[0] += dx;
                        layer.position[1] += dy;
                        needsRefresh = true;
                        layer.dirty = true;
                    }
                });
                //added by jswang begin
                // 点大于200时，拖拽不显示文字
                if(this.elementsLength > 200) {
                    this.painter.noText = true;
                    clearTimeout(that.timer);
                    if (needsRefresh) {
                        this.painter.refresh();
                    }
                    this.timer = setTimeout(function(){
                        that.painter.noText = false;
                        that.painter.refresh(null, true);
                    }, 200);
                }else {
                    if (needsRefresh) {
                        this.painter.refresh();
                    }
                }
                //added by jswang end
            }
            if (this._draggingTarget || this._hasfound && this._lastHover.draggable) {
                cursor = 'move';
            } else if (this._hasfound && this._lastHover.clickable) {
                cursor = 'pointer';
            }
            if (this.isDrawing) {
                cursor = 'crosshair';
            }
            this.root.style.cursor = cursor;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEMOVE, event);
            if (this._draggingTarget || this._hasfound || this.storage.hasHoverShape()) {
                this.painter.refreshHover();
            }
        },
        mouseout: function (event, manually) {
            event = this._zrenderEventFixed(event);
            var element = event.toElement || event.relatedTarget;
            if (element != this.root) {
                while (element && element.nodeType != 9) {
                    if (element == this.root) {
                        this._mousemoveHandler(event, 'mouseout');
                        return;
                    }
                    element = element.parentNode;
                }
            }
            event.zrenderX = this._lastX;
            event.zrenderY = this._lastY;
            this.root.style.cursor = 'default';
            this._isMouseDown = 0;
            this._processOutShape(event);
            this._processDrop(event);
            this._processDragEnd(event);
            if (!this.painter.isLoading()) {
                this.painter.refreshHover();
            }
            this.dispatch(EVENT.GLOBALOUT, event);
        },
        mousedown: function (event, manually) {
            this._clickThreshold = 0;
            if (this._lastDownButton == 2) {
                this._lastDownButton = event.button;
                this._mouseDownTarget = null;
                return;
            }
            this._lastMouseDownMoment = new Date();
            event = this._zrenderEventFixed(event);
            this._isMouseDown = 1;
            this._mouseDownTarget = this._lastHover;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEDOWN, event);
            this._lastDownButton = event.button;
        },
        mouseup: function (event, manually) {
            event = this._zrenderEventFixed(event);
            this.root.style.cursor = 'default';
            this._isMouseDown = 0;
            this._mouseDownTarget = null;
            this._dispatchAgency(this._lastHover, EVENT.MOUSEUP, event);
            this._processDrop(event);
            this._processDragEnd(event);
        },
        touchstart: function (event, manually) {
            event = this._zrenderEventFixed(event, true);
            this._lastTouchMoment = new Date();
            this._mobileFindFixed(event);
            this._mousedownHandler(event);
        },
        touchmove: function (event, manually) {
            event = this._zrenderEventFixed(event, true);
            this._mousemoveHandler(event, 'touchmove');
            if (this._isDragging) {
                eventTool.stop(event);
            }
        },
        touchend: function (event, manually) {
            event = this._zrenderEventFixed(event, true);
            this._mouseupHandler(event);
            var now = new Date();
            if (now - this._lastTouchMoment < EVENT.touchClickDelay) {
                this._mobileFindFixed(event);
                this._clickHandler(event);
                if (now - this._lastClickMoment < EVENT.touchClickDelay / 2) {
                    this._dblclickHandler(event);
                    if (this._lastHover && this._lastHover.clickable) {
                        eventTool.stop(event);
                    }
                }
                this._lastClickMoment = now;
            }
            this.painter.clearHover();
        }
    };
    function bind1Arg(handler, context) {
        return function (e, str) {
            return handler.call(context, e, str);
        };
    }
    function bind3Arg(handler, context) {
        return function (arg1, arg2, arg3) {
            return handler.call(context, arg1, arg2, arg3);
        };
    }
    function initDomHandler(instance) {
        var len = domHandlerNames.length;
        while (len--) {
            var name = domHandlerNames[len];
            instance['_' + name + 'Handler'] = bind1Arg(domHandlers[name], instance);
        }
    }
    var Handler = function (root, storage, painter) {
        Eventful.call(this);
        var that = this;
        this.root = root;
        this.storage = storage;
        this.painter = painter;
        this._lastX = this._lastY = this._mouseX = this._mouseY = 0;
        this._findHover = bind3Arg(findHover, this);
        this._domHover = painter.getDomHover();
        initDomHandler(this);
        if (window.addEventListener) {
            window.addEventListener('resize', this._resizeHandler);
            if (env.os.tablet || env.os.phone) {
                root.addEventListener('touchstart', this._touchstartHandler);
                root.addEventListener('touchmove', this._touchmoveHandler);
                root.addEventListener('touchend', this._touchendHandler);
            } else {
                root.addEventListener('click', this._clickHandler);
                root.addEventListener('dblclick', this._dblclickHandler);
                root.addEventListener('contextmenu', this._contextmenuHandler);
                root.addEventListener('mousewheel', this._mousewheelHandler);
                root.addEventListener('mousemove', this._mousemoveHandler);
                root.addEventListener('mousedown', this._mousedownHandler);
                root.addEventListener('mouseup', this._mouseupHandler);
            }
            root.addEventListener('DOMMouseScroll', this._mousewheelHandler);
            root.addEventListener('mouseout', this._mouseoutHandler);
        } else {
            window.attachEvent('onresize', this._resizeHandler);
            root.attachEvent('onclick', this._clickHandler);
            root.ondblclick = this._dblclickHandler;
            root.attachEvent('oncontextmenu', this._contextmenuHandler);
            root.attachEvent('onmousewheel', this._mousewheelHandler);
            root.attachEvent('onmousemove', function(e) {
                that._mousemoveHandler(e, 'ieDefault');
            });
            root.attachEvent('onmouseout', this._mouseoutHandler);
            root.attachEvent('onmousedown', this._mousedownHandler);
            root.attachEvent('onmouseup', this._mouseupHandler);
        }
    };
    Handler.prototype.on = function (eventName, handler, context) {
        this.bind(eventName, handler, context);
        return this;
    };
    Handler.prototype.un = function (eventName, handler) {
        this.unbind(eventName, handler);
        return this;
    };
    Handler.prototype.trigger = function (eventName, eventArgs) {
        switch (eventName) {
            case EVENT.RESIZE:
            case EVENT.CLICK:
            case EVENT.DBLCLICK:
            case EVENT.MOUSEWHEEL:
            case EVENT.MOUSEMOVE:
            case EVENT.MOUSEDOWN:
            case EVENT.MOUSEUP:
            case EVENT.MOUSEOUT:
                this['_' + eventName + 'Handler'](eventArgs);
                break;
        }
    };
    Handler.prototype.dispose = function () {
        var root = this.root;
        if (window.removeEventListener) {
            window.removeEventListener('resize', this._resizeHandler);
            if (env.os.tablet || env.os.phone) {
                root.removeEventListener('touchstart', this._touchstartHandler);
                root.removeEventListener('touchmove', this._touchmoveHandler);
                root.removeEventListener('touchend', this._touchendHandler);
            } else {
                root.removeEventListener('click', this._clickHandler);
                root.removeEventListener('dblclick', this._dblclickHandler);
                root.removeEventListener('contextmenu', this._contextmenuHandler);
                root.removeEventListener('mousewheel', this._mousewheelHandler);
                root.removeEventListener('mousemove', this._mousemoveHandler);
                root.removeEventListener('mousedown', this._mousedownHandler);
                root.removeEventListener('mouseup', this._mouseupHandler);
            }
            root.removeEventListener('DOMMouseScroll', this._mousewheelHandler);
            root.removeEventListener('mouseout', this._mouseoutHandler);
        } else {
            window.detachEvent('onresize', this._resizeHandler);
            root.detachEvent('onclick', this._clickHandler);
            root.detachEvent('dblclick', this._dblclickHandler);
            root.detachEvent('oncontextmenu', this._contextmenuHandler);
            root.detachEvent('onmousewheel', this._mousewheelHandler);
            root.detachEvent('onmousemove', this._mousemoveHandler);
            root.detachEvent('onmouseout', this._mouseoutHandler);
            root.detachEvent('onmousedown', this._mousedownHandler);
            root.detachEvent('onmouseup', this._mouseupHandler);
        }
        this.root = this._domHover = this.storage = this.painter = null;
        this.un();
    };
    Handler.prototype._processDragStart = function (event) {
        var _lastHover = this._lastHover;
        if (this._isMouseDown && _lastHover && _lastHover.draggable && !this._draggingTarget && this._mouseDownTarget == _lastHover) {
            if (_lastHover.dragEnableTime && new Date() - this._lastMouseDownMoment < _lastHover.dragEnableTime) {
                return;
            }
            var _draggingTarget = _lastHover;
            this._draggingTarget = _draggingTarget;
            this._isDragging = 1;
            _draggingTarget.invisible = true;
            this.storage.mod(_draggingTarget.id);
            /*added by jswang begin*/
            this._dispatchAgency(_draggingTarget, EVENT.DRAGSTART, event);    //提前分发事件，使force的ondragstart事件提前
            var that = this;
            this.storage._hoveredShapes && this.storage._hoveredShapes.forEach(function(shape){
                //invisible = true时不在底层canvas绘制
                shape.invisible = true;
                that.storage.mod(shape.id);
            })
            /*added by jswang end*/
            // this._dispatchAgency(_draggingTarget, EVENT.DRAGSTART, event);  //提前分发事件，使force的ondragstart事件提前
            this.painter.refresh();
        }
    };
    Handler.prototype._processDragEnter = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGENTER, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragOver = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGOVER, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragLeave = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._lastHover, EVENT.DRAGLEAVE, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDrop = function (event) {
        if (this._draggingTarget) {
            this._draggingTarget.invisible = false;
            this.storage.mod(this._draggingTarget.id);
            /*added by jswang begin*/
            var that = this;
            this.storage._hoveredShapes && this.storage._hoveredShapes.forEach(function(shape){
                //拖拽结束，invisible = false
                shape.invisible = false;
                that.storage.mod(shape);
            })
            this.storage._hoveredShapes = [];
            /*added by jswang end*/
            this.painter.refresh();
            this._dispatchAgency(this._lastHover, EVENT.DROP, event, this._draggingTarget);
        }
    };
    Handler.prototype._processDragEnd = function (event) {
        if (this._draggingTarget) {
            this._dispatchAgency(this._draggingTarget, EVENT.DRAGEND, event);
            this._lastHover = null;
        }
        this._isDragging = 0;
        this._draggingTarget = null;
    };
    Handler.prototype._processOverShape = function (event) {
        this._dispatchAgency(this._lastHover, EVENT.MOUSEOVER, event);
    };
    Handler.prototype._processOutShape = function (event) {
        this._dispatchAgency(this._lastHover, EVENT.MOUSEOUT, event);
    };
    Handler.prototype._dispatchAgency = function (targetShape, eventName, event, draggedShape) {
        var eventHandler = 'on' + eventName;
        var eventPacket = {
            type: eventName,
            event: event,
            target: targetShape,
            cancelBubble: false
        };
        var el = targetShape;
        if (draggedShape) {
            eventPacket.dragged = draggedShape;
        }
        while (el) {
            el[eventHandler] && (eventPacket.cancelBubble = el[eventHandler](eventPacket));
            el.dispatch(eventName, eventPacket);
            el = el.parent;
            if (eventPacket.cancelBubble) {
                break;
            }
        }
        if (targetShape) {
            if (!eventPacket.cancelBubble) {
                this.dispatch(eventName, eventPacket);
            }
        } else if (!draggedShape) {
            var eveObj = {
                type: eventName,
                event: event
            };
            this.dispatch(eventName, eveObj);
            this.painter.eachOtherLayer(function (layer) {
                if (typeof layer[eventHandler] == 'function') {
                    layer[eventHandler](eveObj);
                }
                if (layer.dispatch) {
                    layer.dispatch(eventName, eveObj);
                }
            });
        }
    };
    Handler.prototype._iterateAndFindHover = function () {
        var invTransform = mat2d.create();
        return function () {
            var list = this.storage.getShapeList();
            var currentZLevel;
            var currentLayer;
            var tmp = [
                0,
                0
            ];
            for (var i = list.length - 1; i >= 0; i--) {
                var shape = list[i];
                if (currentZLevel !== shape.zlevel) {
                    currentLayer = this.painter.getLayer(shape.zlevel, currentLayer);
                    tmp[0] = this._mouseX;
                    tmp[1] = this._mouseY;
                    if (currentLayer.needTransform) {
                        mat2d.invert(invTransform, currentLayer.transform);
                        vec2.applyTransform(tmp, tmp, invTransform);
                    }
                }
                if (this._findHover(shape, tmp[0], tmp[1])) {
                    break;
                }
            }
        };
    }();
    var MOBILE_TOUCH_OFFSETS = [
        { x: 10 },
        { x: -20 },
        {
            x: 10,
            y: 10
        },
        { y: -20 }
    ];
    Handler.prototype._mobileFindFixed = function (event) {
        this._lastHover = null;
        this._mouseX = event.zrenderX;
        this._mouseY = event.zrenderY;
        this._event = event;
        this._iterateAndFindHover();
        for (var i = 0; !this._lastHover && i < MOBILE_TOUCH_OFFSETS.length; i++) {
            var offset = MOBILE_TOUCH_OFFSETS[i];
            offset.x && (this._mouseX += offset.x);
            offset.y && (this._mouseY += offset.y);
            this._iterateAndFindHover();
        }
        if (this._lastHover) {
            event.zrenderX = this._mouseX;
            event.zrenderY = this._mouseY;
        }
    };
    function findHover(shape, x, y) {
        if (this._draggingTarget && this._draggingTarget.id == shape.id || shape.isSilent()) {
            return false;
        }
        var event = this._event;
        if (shape.isCover(x, y)) {
            /*deleted by jswang begin*/
            /*shape在hover时不移动到hover层，否则line在hover时将显示在node上层*/
            // if (shape.hoverable) {
            //     this.storage.addHover(shape);
            // }
            /*deleted by jswang end*/
            var p = shape.parent;
            while (p) {
                if (p.clipShape && !p.clipShape.isCover(this._mouseX, this._mouseY)) {
                    return false;
                }
                p = p.parent;
            }
            if (this._lastHover != shape) {
                this._processOutShape(event);
                this._processDragLeave(event);
                this._lastHover = shape;
                this._processDragEnter(event);
            }
            this._processOverShape(event);
            this._processDragOver(event);
            this._hasfound = 1;
            return true;
        }
        return false;
    }
    Handler.prototype._zrenderEventFixed = function (event, isTouch) {
        if (event.zrenderFixed) {
            return event;
        }
        if (!isTouch) {
            event = event || window.event;
            var target = event.toElement || event.relatedTarget || event.srcElement || event.target;
            if (target && target != this._domHover) {
                event.zrenderX = (typeof event.offsetX != 'undefined' ? event.offsetX : event.layerX) + target.offsetLeft;
                event.zrenderY = (typeof event.offsetY != 'undefined' ? event.offsetY : event.layerY) + target.offsetTop;
            }
        } else {
            var touch = event.type != 'touchend' ? event.targetTouches[0] : event.changedTouches[0];
            if (touch) {
                var rBounding = this.painter._domRoot.getBoundingClientRect();
                event.zrenderX = touch.clientX - rBounding.left;
                event.zrenderY = touch.clientY - rBounding.top;
            }
        }
        event.zrenderFixed = 1;
        return event;
    };
    util.merge(Handler.prototype, Eventful.prototype, true);
    return Handler;
});define('zrender/Painter', [
    'require',
    './config',
    './tool/util',
    './tool/log',
    './loadingEffect/Base',
    './Layer',
    './shape/Image'
], function (require) {
    'use strict';
    var config = require('./config');
    var util = require('./tool/util');
    var log = require('./tool/log');
    var BaseLoadingEffect = require('./loadingEffect/Base');
    var Layer = require('./Layer');
    function returnFalse() {
        return false;
    }
    function doNothing() {
    }
    function isLayerValid(layer) {
        if (!layer) {
            return false;
        }
        if (layer.isBuildin) {
            return true;
        }
        if (typeof layer.resize !== 'function' || typeof layer.refresh !== 'function') {
            return false;
        }
        return true;
    }
    var Painter = function (root, storage) {
        this.root = root;
        root.style['-webkit-tap-highlight-color'] = 'transparent';
        root.style['-webkit-user-select'] = 'none';
        root.style['user-select'] = 'none';
        root.style['-webkit-touch-callout'] = 'none';
        this.storage = storage;
        root.innerHTML = '';
        this._width = this._getWidth();
        this._height = this._getHeight();
        var domRoot = document.createElement('div');
        this._domRoot = domRoot;
        domRoot.style.position = 'relative';
        domRoot.style.overflow = 'hidden';
        domRoot.style.width = this._width + 'px';
        domRoot.style.height = this._height + 'px';
        root.appendChild(domRoot);
        this._layers = {};
        this._zlevelList = [];
        this._layerConfig = {};
        this._loadingEffect = new BaseLoadingEffect({});
        this.shapeToImage = this._createShapeToImageProcessor();
        this._bgDom = document.createElement('div');
        this._bgDom.style.cssText = [
            'position:absolute;left:0px;top:0px;width:',
            this._width,
            'px;height:',
            this._height + 'px;',
            '-webkit-user-select:none;user-select;none;',
            '-webkit-touch-callout:none;'
        ].join('');
        this._bgDom.setAttribute('data-zr-dom-id', 'bg');
        domRoot.appendChild(this._bgDom);
        this._bgDom.onselectstart = returnFalse;
        var hoverLayer = new Layer('_zrender_hover_', this);
        this._layers['hover'] = hoverLayer;
        domRoot.appendChild(hoverLayer.dom);
        hoverLayer.initContext();
        hoverLayer.dom.onselectstart = returnFalse;
        hoverLayer.dom.style['-webkit-user-select'] = 'none';
        hoverLayer.dom.style['user-select'] = 'none';
        hoverLayer.dom.style['-webkit-touch-callout'] = 'none';
        this.refreshNextFrame = null;
    };
    Painter.prototype.render = function (callback) {
        if (this.isLoading()) {
            this.hideLoading();
        }
        this.refresh(callback, true);
        return this;
    };
    Painter.prototype.refresh = function (callback, paintAll) {
        var list = this.storage.getShapeList(true);
        this._paintList(list, paintAll);
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (!layer.isBuildin && layer.refresh) {
                layer.refresh();
            }
        }
        if (typeof callback == 'function') {
            callback();
        }
        return this;
    };
    Painter.prototype._preProcessLayer = function (layer) {
        layer.unusedCount++;
        layer.updateTransform();
    };
    Painter.prototype._postProcessLayer = function (layer) {
        layer.dirty = false;
        if (layer.unusedCount == 1) {
            layer.clear();
        }
    };
    Painter.prototype._paintList = function (list, paintAll) {
        if (typeof paintAll == 'undefined') {
            paintAll = false;
        }
        this._updateLayerStatus(list);
        var currentLayer;
        var currentZLevel;
        var ctx;
        this.eachBuildinLayer(this._preProcessLayer);
        for (var i = 0, l = list.length; i < l; i++) {
            var shape = list[i];
            if (currentZLevel !== shape.zlevel) {
                if (currentLayer) {
                    if (currentLayer.needTransform) {
                        ctx.restore();
                    }
                    ctx.flush && ctx.flush();
                }
                currentZLevel = shape.zlevel;
                currentLayer = this.getLayer(currentZLevel);
                if (!currentLayer.isBuildin) {
                    log('ZLevel ' + currentZLevel + ' has been used by unkown layer ' + currentLayer.id);
                }
                ctx = currentLayer.ctx;
                currentLayer.unusedCount = 0;
                if (currentLayer.dirty || paintAll) {
                    currentLayer.clear();
                }
                if (currentLayer.needTransform) {
                    ctx.save();
                    currentLayer.setTransform(ctx);
                }
            }
            if ((currentLayer.dirty || paintAll) && !shape.invisible) {
                if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, false)) {
                    //deleted by jswang
                    // if (config.catchBrushException) {
                    //     try {
                    //         shape.brush(ctx, false, this.refreshNextFrame);
                    //     } catch (error) {
                    //         log(error, 'brush error of ' + shape.type, shape);
                    //     }
                    // } else {
                    shape.noText = this.noText;
                    shape.brush(ctx, false, this.refreshNextFrame);
                    // }
                }
            }
            shape.__dirty = false;
        }
        if (currentLayer) {
            if (currentLayer.needTransform) {
                ctx.restore();
            }
            ctx.flush && ctx.flush();
        }
        this.eachBuildinLayer(this._postProcessLayer);
    };
    Painter.prototype.getLayer = function (zlevel) {
        var layer = this._layers[zlevel];
        if (!layer) {
            layer = new Layer(zlevel, this);
            layer.isBuildin = true;
            if (this._layerConfig[zlevel]) {
                util.merge(layer, this._layerConfig[zlevel], true);
            }
            layer.updateTransform();
            this.insertLayer(zlevel, layer);
            layer.initContext();
        }
        return layer;
    };
    Painter.prototype.insertLayer = function (zlevel, layer) {
        if (this._layers[zlevel]) {
            log('ZLevel ' + zlevel + ' has been used already');
            return;
        }
        if (!isLayerValid(layer)) {
            log('Layer of zlevel ' + zlevel + ' is not valid');
            return;
        }
        var len = this._zlevelList.length;
        var prevLayer = null;
        var i = -1;
        if (len > 0 && zlevel > this._zlevelList[0]) {
            for (i = 0; i < len - 1; i++) {
                if (this._zlevelList[i] < zlevel && this._zlevelList[i + 1] > zlevel) {
                    break;
                }
            }
            prevLayer = this._layers[this._zlevelList[i]];
        }
        this._zlevelList.splice(i + 1, 0, zlevel);
        var prevDom = prevLayer ? prevLayer.dom : this._bgDom;
        if (prevDom.nextSibling) {
            prevDom.parentNode.insertBefore(layer.dom, prevDom.nextSibling);
        } else {
            prevDom.parentNode.appendChild(layer.dom);
        }
        this._layers[zlevel] = layer;
    };
    Painter.prototype.eachLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            cb.call(context, this._layers[z], z);
        }
    };
    Painter.prototype.eachBuildinLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (layer.isBuildin) {
                cb.call(context, layer, z);
            }
        }
    };
    Painter.prototype.eachOtherLayer = function (cb, context) {
        for (var i = 0; i < this._zlevelList.length; i++) {
            var z = this._zlevelList[i];
            var layer = this._layers[z];
            if (!layer.isBuildin) {
                cb.call(context, layer, z);
            }
        }
    };
    Painter.prototype.getLayers = function () {
        return this._layers;
    };
    Painter.prototype._updateLayerStatus = function (list) {
        var layers = this._layers;
        var elCounts = {};
        this.eachBuildinLayer(function (layer, z) {
            elCounts[z] = layer.elCount;
            layer.elCount = 0;
        });
        for (var i = 0, l = list.length; i < l; i++) {
            var shape = list[i];
            var zlevel = shape.zlevel;
            var layer = layers[zlevel];
            if (layer) {
                layer.elCount++;
                if (layer.dirty) {
                    continue;
                }
                layer.dirty = shape.__dirty;
            }
        }
        this.eachBuildinLayer(function (layer, z) {
            if (elCounts[z] !== layer.elCount) {
                layer.dirty = true;
            }
        });
    };
    Painter.prototype.refreshShapes = function (shapeList, callback) {
        for (var i = 0, l = shapeList.length; i < l; i++) {
            var shape = shapeList[i];
            shape.modSelf();
        }
        this.refresh(callback);
        return this;
    };
    Painter.prototype.setLoadingEffect = function (loadingEffect) {
        this._loadingEffect = loadingEffect;
        return this;
    };
    Painter.prototype.clear = function () {
        this.eachBuildinLayer(this._clearLayer);
        return this;
    };
    Painter.prototype._clearLayer = function (layer) {
        layer.clear();
    };
    Painter.prototype.modLayer = function (zlevel, config) {
        if (config) {
            if (!this._layerConfig[zlevel]) {
                this._layerConfig[zlevel] = config;
            } else {
                util.merge(this._layerConfig[zlevel], config, true);
            }
            var layer = this._layers[zlevel];
            if (layer) {
                util.merge(layer, this._layerConfig[zlevel], true);
            }
        }
    };
    Painter.prototype.delLayer = function (zlevel) {
        var layer = this._layers[zlevel];
        if (!layer) {
            return;
        }
        this.modLayer(zlevel, {
            position: layer.position,
            rotation: layer.rotation,
            scale: layer.scale
        });
        layer.dom.parentNode.removeChild(layer.dom);
        delete this._layers[zlevel];
        this._zlevelList.splice(util.indexOf(this._zlevelList, zlevel), 1);
    };
    Painter.prototype.refreshHover = function () {
        this.clearHover();
        var list = this.storage.getHoverShapes(true);
        for (var i = 0, l = list.length; i < l; i++) {
            this._brushHover(list[i]);
        }
        var ctx = this._layers.hover.ctx;
        ctx.flush && ctx.flush();
        this.storage.delHover();
        return this;
    };
    Painter.prototype.clearHover = function () {
        var hover = this._layers.hover;
        hover && hover.clear();
        return this;
    };
    Painter.prototype.showLoading = function (loadingEffect) {
        this._loadingEffect && this._loadingEffect.stop();
        loadingEffect && this.setLoadingEffect(loadingEffect);
        this._loadingEffect.start(this);
        this.loading = true;
        return this;
    };
    Painter.prototype.hideLoading = function () {
        this._loadingEffect.stop();
        this.clearHover();
        this.loading = false;
        return this;
    };
    Painter.prototype.isLoading = function () {
        return this.loading;
    };
    Painter.prototype.resize = function () {
        var domRoot = this._domRoot;
        domRoot.style.display = 'none';
        var width = this._getWidth();
        var height = this._getHeight();
        domRoot.style.display = '';
        if (this._width != width || height != this._height) {
            this._width = width;
            this._height = height;
            domRoot.style.width = width + 'px';
            domRoot.style.height = height + 'px';
            for (var id in this._layers) {
                this._layers[id].resize(width, height);
            }
            this.refresh(null, true);
        }
        return this;
    };
    Painter.prototype.clearLayer = function (zLevel) {
        var layer = this._layers[zLevel];
        if (layer) {
            layer.clear();
        }
    };
    Painter.prototype.dispose = function () {
        if (this.isLoading()) {
            this.hideLoading();
        }
        this.root.innerHTML = '';
        this.root = this.storage = this._domRoot = this._layers = null;
    };
    Painter.prototype.getDomHover = function () {
        return this._layers.hover.dom;
    };
    Painter.prototype.toDataURL = function (type, backgroundColor, args) {
        var imageLayer = new Layer('image', this);
        this._bgDom.appendChild(imageLayer.dom);
        imageLayer.initContext();
        var ctx = imageLayer.ctx;
        imageLayer.clearColor = backgroundColor || '#fff';
        imageLayer.clear();
        var self = this;
        this.storage.iterShape(function (shape) {
            if (!shape.invisible) {
                if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, false)) {
                    if (config.catchBrushException) {
                        try {
                            shape.brush(ctx, false, self.refreshNextFrame);
                        } catch (error) {
                            log(error, 'brush error of ' + shape.type, shape);
                        }
                    } else {
                        shape.brush(ctx, false, self.refreshNextFrame);
                    }
                }
            }
        }, {
            normal: 'up',
            update: true
        });
        var image = imageLayer.dom.toDataURL(type, args);
        ctx = null;
        this._bgDom.removeChild(imageLayer.dom);
        return image;
    };
    Painter.prototype.getWidth = function () {
        return this._width;
    };
    Painter.prototype.getHeight = function () {
        return this._height;
    };
    Painter.prototype._getWidth = function () {
        var root = this.root;
        var stl = root.currentStyle || document.defaultView.getComputedStyle(root);
        return ((root.clientWidth || parseInt(stl.width, 10)) - parseInt(stl.paddingLeft, 10) - parseInt(stl.paddingRight, 10)).toFixed(0) - 0;
    };
    Painter.prototype._getHeight = function () {
        var root = this.root;
        var stl = root.currentStyle || document.defaultView.getComputedStyle(root);
        return ((root.clientHeight || parseInt(stl.height, 10)) - parseInt(stl.paddingTop, 10) - parseInt(stl.paddingBottom, 10)).toFixed(0) - 0;
    };
    Painter.prototype._brushHover = function (shape) {
        var ctx = this._layers.hover.ctx;
        if (!shape.onbrush || shape.onbrush && !shape.onbrush(ctx, true)) {
            var layer = this.getLayer(shape.zlevel);
            if (layer.needTransform) {
                ctx.save();
                layer.setTransform(ctx);
            }
            /*modified by jswang4 begin*/
            /*brush第二个参数改为false，shape在hover层不显示高亮样式（force图的Line高亮时透明度为0）*/
            // if (config.catchBrushException) {
            //     try {
            //         shape.brush(ctx, false, this.refreshNextFrame);
            //     } catch (error) {
            //         log(error, 'hoverBrush error of ' + shape.type, shape);
            //     }
            // } else {
            shape.noText = this.noText;
            shape.brush(ctx, false, this.refreshNextFrame);
            // }
            /*modified by jswang4 end*/
            if (layer.needTransform) {
                ctx.restore();
            }
        }
    };
    Painter.prototype._shapeToImage = function (id, shape, width, height, devicePixelRatio) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.setAttribute('width', width * devicePixelRatio);
        canvas.setAttribute('height', height * devicePixelRatio);
        ctx.clearRect(0, 0, width * devicePixelRatio, height * devicePixelRatio);
        var shapeTransform = {
            position: shape.position,
            rotation: shape.rotation,
            scale: shape.scale
        };
        shape.position = [
            0,
            0,
            0
        ];
        shape.rotation = 0;
        shape.scale = [
            1,
            1
        ];
        if (shape) {
            shape.brush(ctx, false);
        }
        var ImageShape = require('./shape/Image');
        var imgShape = new ImageShape({
            id: id,
            style: {
                x: 0,
                y: 0,
                image: canvas
            }
        });
        if (shapeTransform.position != null) {
            imgShape.position = shape.position = shapeTransform.position;
        }
        if (shapeTransform.rotation != null) {
            imgShape.rotation = shape.rotation = shapeTransform.rotation;
        }
        if (shapeTransform.scale != null) {
            imgShape.scale = shape.scale = shapeTransform.scale;
        }
        return imgShape;
    };
    Painter.prototype._createShapeToImageProcessor = function () {
        var me = this;
        return function (id, e, width, height) {
            return me._shapeToImage(id, e, width, height, config.devicePixelRatio);
        };
    };
    return Painter;
});define('zrender/Storage', [
    'require',
    './tool/util',
    './Group'
], function (require) {
    'use strict';
    var util = require('./tool/util');
    var Group = require('./Group');
    var defaultIterateOption = {
        hover: false,
        normal: 'down',
        update: false
    };
    function shapeCompareFunc(a, b) {
        if (a.zlevel == b.zlevel) {
            if (a.z == b.z) {
                return a.__renderidx - b.__renderidx;
            }
            return a.z - b.z;
        }
        return a.zlevel - b.zlevel;
    }
    var Storage = function () {
        this._elements = {};
        this._hoverElements = [];
        this._roots = [];
        this._shapeList = [];
        this._shapeListOffset = 0;
    };
    Storage.prototype.iterShape = function (fun, option) {
        if (!option) {
            option = defaultIterateOption;
        }
        if (option.hover) {
            for (var i = 0, l = this._hoverElements.length; i < l; i++) {
                var el = this._hoverElements[i];
                el.updateTransform();
                if (fun(el)) {
                    return this;
                }
            }
        }
        if (option.update) {
            this.updateShapeList();
        }
        switch (option.normal) {
            case 'down':
                var l = this._shapeList.length;
                while (l--) {
                    if (fun(this._shapeList[l])) {
                        return this;
                    }
                }
                break;
            default:
                for (var i = 0, l = this._shapeList.length; i < l; i++) {
                    if (fun(this._shapeList[i])) {
                        return this;
                    }
                }
                break;
        }
        return this;
    };
    Storage.prototype.getHoverShapes = function (update) {
        var hoverElements = [];
        for (var i = 0, l = this._hoverElements.length; i < l; i++) {
            hoverElements.push(this._hoverElements[i]);
            var target = this._hoverElements[i].hoverConnect;
            if (target) {
                var shape;
                target = target instanceof Array ? target : [target];
                for (var j = 0, k = target.length; j < k; j++) {
                    shape = target[j].id ? target[j] : this.get(target[j]);
                    if (shape) {
                        hoverElements.push(shape);
                    }
                }
            }
        }
        hoverElements.sort(shapeCompareFunc);
        if (update) {
            for (var i = 0, l = hoverElements.length; i < l; i++) {
                hoverElements[i].updateTransform();
            }
        }
        return hoverElements;
    };
    Storage.prototype.getShapeList = function (update) {
        if (update) {
            this.updateShapeList();
        }
        return this._shapeList;
    };
    Storage.prototype.updateShapeList = function () {
        this._shapeListOffset = 0;
        for (var i = 0, len = this._roots.length; i < len; i++) {
            var root = this._roots[i];
            this._updateAndAddShape(root);
        }
        this._shapeList.length = this._shapeListOffset;
        //deleted by jswang
        // for (var i = 0, len = this._shapeList.length; i < len; i++) {
        //     this._shapeList[i].__renderidx = i;
        // }
        this._shapeList.sort(shapeCompareFunc);
    };
    Storage.prototype._updateAndAddShape = function (el, clipShapes) {
        if (el.ignore) {
            return;
        }
        el.updateTransform();
        if (el.type == 'group') {
            if (el.clipShape) {
                el.clipShape.parent = el;
                el.clipShape.updateTransform();
                if (clipShapes) {
                    clipShapes = clipShapes.slice();
                    clipShapes.push(el.clipShape);
                } else {
                    clipShapes = [el.clipShape];
                }
            }
            for (var i = 0; i < el._children.length; i++) {
                var child = el._children[i];
                child.__dirty = el.__dirty || child.__dirty;
                this._updateAndAddShape(child, clipShapes);
            }
            el.__dirty = false;
        } else {
            //modified by jswang begin
            var _shapeListOffset = this._shapeListOffset;
            el.__clipShapes = clipShapes;
            this._shapeList[_shapeListOffset] = el;
            this._shapeList[_shapeListOffset].__renderidx = this._shapeListOffset++;
            //modified by jswang end
        }
    };
    Storage.prototype.mod = function (el, params) {
        if (typeof el === 'string') {
            el = this._elements[el];
        }
        if (el) {
            el.modSelf();
            if (params) {
                if (params.parent || params._storage || params.__clipShapes) {
                    var target = {};
                    for (var name in params) {
                        if (name === 'parent' || name === '_storage' || name === '__clipShapes') {
                            continue;
                        }
                        if (params.hasOwnProperty(name)) {
                            target[name] = params[name];
                        }
                    }
                    util.merge(el, target, true);
                } else {
                    util.merge(el, params, true);
                }
            }
        }
        return this;
    };
    Storage.prototype.drift = function (shapeId, dx, dy) {
        var shape = this._elements[shapeId];
        if (shape) {
            shape.needTransform = true;
            if (shape.draggable === 'horizontal') {
                dy = 0;
            } else if (shape.draggable === 'vertical') {
                dx = 0;
            }
            if (!shape.ondrift || shape.ondrift && !shape.ondrift(dx, dy)) {
                shape.drift(dx, dy);
            }
        }
        return this;
    };
    Storage.prototype.addHover = function (shape) {
        shape.updateNeedTransform();
        this._hoverElements.push(shape);
        return this;
    };
    Storage.prototype.delHover = function () {
        this._hoverElements = [];
        return this;
    };
    Storage.prototype.hasHoverShape = function () {
        return this._hoverElements.length > 0;
    };
    Storage.prototype.addRoot = function (el) {
        if (this._elements[el.id]) {
            return;
        }
        if (el instanceof Group) {
            el.addChildrenToStorage(this);
        }
        this.addToMap(el);
        this._roots.push(el);
    };
    Storage.prototype.delRoot = function (elId) {
        if (typeof elId == 'undefined') {
            for (var i = 0; i < this._roots.length; i++) {
                var root = this._roots[i];
                if (root instanceof Group) {
                    root.delChildrenFromStorage(this);
                }
            }
            this._elements = {};
            this._hoverElements = [];
            this._roots = [];
            this._shapeList = [];
            this._shapeListOffset = 0;
            return;
        }
        if (elId instanceof Array) {
            for (var i = 0, l = elId.length; i < l; i++) {
                this.delRoot(elId[i]);
            }
            return;
        }
        var el;
        if (typeof elId == 'string') {
            el = this._elements[elId];
        } else {
            el = elId;
        }
        var idx = util.indexOf(this._roots, el);
        if (idx >= 0) {
            this.delFromMap(el.id);
            this._roots.splice(idx, 1);
            if (el instanceof Group) {
                el.delChildrenFromStorage(this);
            }
        }
    };
    Storage.prototype.addToMap = function (el) {
        if (el instanceof Group) {
            el._storage = this;
        }
        el.modSelf();
        this._elements[el.id] = el;
        return this;
    };
    Storage.prototype.get = function (elId) {
        return this._elements[elId];
    };
    Storage.prototype.delFromMap = function (elId) {
        var el = this._elements[elId];
        if (el) {
            delete this._elements[elId];
            if (el instanceof Group) {
                el._storage = null;
            }
        }
        return this;
    };
    Storage.prototype.dispose = function () {
        this._elements = this._renderList = this._roots = this._hoverElements = null;
    };
    return Storage;
});define('zrender/animation/Animation', [
    'require',
    './Clip',
    '../tool/color',
    '../tool/util',
    '../tool/event'
], function (require) {
    'use strict';
    var Clip = require('./Clip');
    var color = require('../tool/color');
    var util = require('../tool/util');
    var Dispatcher = require('../tool/event').Dispatcher;
    var requestAnimationFrame = window.requestAnimationFrame || window.msRequestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function (func) {
            setTimeout(func, 16);
        };
    var arraySlice = Array.prototype.slice;
    var Animation = function (options) {
        options = options || {};
        this.stage = options.stage || {};
        this.onframe = options.onframe || function () {
            };
        this._clips = [];
        this._running = false;
        this._time = 0;
        Dispatcher.call(this);
    };
    Animation.prototype = {
        add: function (clip) {
            this._clips.push(clip);
        },
        remove: function (clip) {
            var idx = util.indexOf(this._clips, clip);
            if (idx >= 0) {
                this._clips.splice(idx, 1);
            }
        },
        _update: function () {
            var time = new Date().getTime();
            var delta = time - this._time;
            var clips = this._clips;
            var len = clips.length;
            var deferredEvents = [];
            var deferredClips = [];
            for (var i = 0; i < len; i++) {
                var clip = clips[i];
                var e = clip.step(time);
                if (e) {
                    deferredEvents.push(e);
                    deferredClips.push(clip);
                }
            }
            for (var i = 0; i < len;) {
                if (clips[i]._needsRemove) {
                    clips[i] = clips[len - 1];
                    clips.pop();
                    len--;
                } else {
                    i++;
                }
            }
            len = deferredEvents.length;
            for (var i = 0; i < len; i++) {
                deferredClips[i].fire(deferredEvents[i]);
            }
            this._time = time;
            this.onframe(delta);
            this.dispatch('frame', delta);
            if (this.stage.update) {
                this.stage.update();
            }
        },
        start: function () {
            var self = this;
            this._running = true;
            function step() {
                if (self._running) {
                    requestAnimationFrame(step);
                    self._update();
                }
            }
            this._time = new Date().getTime();
            requestAnimationFrame(step);
        },
        stop: function () {
            this._running = false;
        },
        clear: function () {
            this._clips = [];
        },
        animate: function (target, options) {
            options = options || {};
            var deferred = new Animator(target, options.loop, options.getter, options.setter);
            deferred.animation = this;
            return deferred;
        },
        constructor: Animation
    };
    util.merge(Animation.prototype, Dispatcher.prototype, true);
    function _defaultGetter(target, key) {
        return target[key];
    }
    function _defaultSetter(target, key, value) {
        target[key] = value;
    }
    function _interpolateNumber(p0, p1, percent) {
        return (p1 - p0) * percent + p0;
    }
    function _interpolateArray(p0, p1, percent, out, arrDim) {
        var len = p0.length;
        if (arrDim == 1) {
            for (var i = 0; i < len; i++) {
                out[i] = _interpolateNumber(p0[i], p1[i], percent);
            }
        } else {
            var len2 = p0[0].length;
            for (var i = 0; i < len; i++) {
                for (var j = 0; j < len2; j++) {
                    out[i][j] = _interpolateNumber(p0[i][j], p1[i][j], percent);
                }
            }
        }
    }
    function _isArrayLike(data) {
        switch (typeof data) {
            case 'undefined':
            case 'string':
                return false;
        }
        return typeof data.length !== 'undefined';
    }
    function _catmullRomInterpolateArray(p0, p1, p2, p3, t, t2, t3, out, arrDim) {
        var len = p0.length;
        if (arrDim == 1) {
            for (var i = 0; i < len; i++) {
                out[i] = _catmullRomInterpolate(p0[i], p1[i], p2[i], p3[i], t, t2, t3);
            }
        } else {
            var len2 = p0[0].length;
            for (var i = 0; i < len; i++) {
                for (var j = 0; j < len2; j++) {
                    out[i][j] = _catmullRomInterpolate(p0[i][j], p1[i][j], p2[i][j], p3[i][j], t, t2, t3);
                }
            }
        }
    }
    function _catmullRomInterpolate(p0, p1, p2, p3, t, t2, t3) {
        var v0 = (p2 - p0) * 0.5;
        var v1 = (p3 - p1) * 0.5;
        return (2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
    }
    function _cloneValue(value) {
        if (_isArrayLike(value)) {
            var len = value.length;
            if (_isArrayLike(value[0])) {
                var ret = [];
                for (var i = 0; i < len; i++) {
                    ret.push(arraySlice.call(value[i]));
                }
                return ret;
            } else {
                return arraySlice.call(value);
            }
        } else {
            return value;
        }
    }
    function rgba2String(rgba) {
        rgba[0] = Math.floor(rgba[0]);
        rgba[1] = Math.floor(rgba[1]);
        rgba[2] = Math.floor(rgba[2]);
        return 'rgba(' + rgba.join(',') + ')';
    }
    var Animator = function (target, loop, getter, setter) {
        this._tracks = {};
        this._target = target;
        this._loop = loop || false;
        this._getter = getter || _defaultGetter;
        this._setter = setter || _defaultSetter;
        this._clipCount = 0;
        this._delay = 0;
        this._doneList = [];
        this._onframeList = [];
        this._clipList = [];
    };
    Animator.prototype = {
        when: function (time, props) {
            for (var propName in props) {
                if (!this._tracks[propName]) {
                    this._tracks[propName] = [];
                    if (time !== 0) {
                        this._tracks[propName].push({
                            time: 0,
                            value: _cloneValue(this._getter(this._target, propName))
                        });
                    }
                }
                this._tracks[propName].push({
                    time: parseInt(time, 10),
                    value: props[propName]
                });
            }
            return this;
        },
        during: function (callback) {
            this._onframeList.push(callback);
            return this;
        },
        start: function (easing) {
            var self = this;
            var setter = this._setter;
            var getter = this._getter;
            var useSpline = easing === 'spline';
            var ondestroy = function () {
                self._clipCount--;
                if (self._clipCount === 0) {
                    self._tracks = {};
                    var len = self._doneList.length;
                    for (var i = 0; i < len; i++) {
                        self._doneList[i].call(self);
                    }
                }
            };
            var createTrackClip = function (keyframes, propName) {
                var trackLen = keyframes.length;
                if (!trackLen) {
                    return;
                }
                var firstVal = keyframes[0].value;
                var isValueArray = _isArrayLike(firstVal);
                var isValueColor = false;
                var arrDim = isValueArray && _isArrayLike(firstVal[0]) ? 2 : 1;
                keyframes.sort(function (a, b) {
                    return a.time - b.time;
                });
                var trackMaxTime;
                if (trackLen) {
                    trackMaxTime = keyframes[trackLen - 1].time;
                } else {
                    return;
                }
                var kfPercents = [];
                var kfValues = [];
                for (var i = 0; i < trackLen; i++) {
                    kfPercents.push(keyframes[i].time / trackMaxTime);
                    var value = keyframes[i].value;
                    if (typeof value == 'string') {
                        value = color.toArray(value);
                        if (value.length === 0) {
                            value[0] = value[1] = value[2] = 0;
                            value[3] = 1;
                        }
                        isValueColor = true;
                    }
                    kfValues.push(value);
                }
                var cacheKey = 0;
                var cachePercent = 0;
                var start;
                var i;
                var w;
                var p0;
                var p1;
                var p2;
                var p3;
                if (isValueColor) {
                    var rgba = [
                        0,
                        0,
                        0,
                        0
                    ];
                }
                var onframe = function (target, percent) {
                    if (percent < cachePercent) {
                        start = Math.min(cacheKey + 1, trackLen - 1);
                        for (i = start; i >= 0; i--) {
                            if (kfPercents[i] <= percent) {
                                break;
                            }
                        }
                        i = Math.min(i, trackLen - 2);
                    } else {
                        for (i = cacheKey; i < trackLen; i++) {
                            if (kfPercents[i] > percent) {
                                break;
                            }
                        }
                        i = Math.min(i - 1, trackLen - 2);
                    }
                    cacheKey = i;
                    cachePercent = percent;
                    var range = kfPercents[i + 1] - kfPercents[i];
                    if (range === 0) {
                        return;
                    } else {
                        w = (percent - kfPercents[i]) / range;
                    }
                    if (useSpline) {
                        p1 = kfValues[i];
                        p0 = kfValues[i === 0 ? i : i - 1];
                        p2 = kfValues[i > trackLen - 2 ? trackLen - 1 : i + 1];
                        p3 = kfValues[i > trackLen - 3 ? trackLen - 1 : i + 2];
                        if (isValueArray) {
                            _catmullRomInterpolateArray(p0, p1, p2, p3, w, w * w, w * w * w, getter(target, propName), arrDim);
                        } else {
                            var value;
                            if (isValueColor) {
                                value = _catmullRomInterpolateArray(p0, p1, p2, p3, w, w * w, w * w * w, rgba, 1);
                                value = rgba2String(rgba);
                            } else {
                                value = _catmullRomInterpolate(p0, p1, p2, p3, w, w * w, w * w * w);
                            }
                            setter(target, propName, value);
                        }
                    } else {
                        if (isValueArray) {
                            _interpolateArray(kfValues[i], kfValues[i + 1], w, getter(target, propName), arrDim);
                        } else {
                            var value;
                            if (isValueColor) {
                                _interpolateArray(kfValues[i], kfValues[i + 1], w, rgba, 1);
                                value = rgba2String(rgba);
                            } else {
                                value = _interpolateNumber(kfValues[i], kfValues[i + 1], w);
                            }
                            setter(target, propName, value);
                        }
                    }
                    for (i = 0; i < self._onframeList.length; i++) {
                        self._onframeList[i](target, percent);
                    }
                };
                var clip = new Clip({
                    target: self._target,
                    life: trackMaxTime,
                    loop: self._loop,
                    delay: self._delay,
                    onframe: onframe,
                    ondestroy: ondestroy
                });
                if (easing && easing !== 'spline') {
                    clip.easing = easing;
                }
                self._clipList.push(clip);
                self._clipCount++;
                self.animation.add(clip);
            };
            for (var propName in this._tracks) {
                createTrackClip(this._tracks[propName], propName);
            }
            return this;
        },
        stop: function () {
            for (var i = 0; i < this._clipList.length; i++) {
                var clip = this._clipList[i];
                this.animation.remove(clip);
            }
            this._clipList = [];
        },
        delay: function (time) {
            this._delay = time;
            return this;
        },
        done: function (cb) {
            if (cb) {
                this._doneList.push(cb);
            }
            return this;
        }
    };
    return Animation;
});define('zrender/tool/vector', [], function () {
    var ArrayCtor = typeof Float32Array === 'undefined' ? Array : Float32Array;
    var vector = {
        create: function (x, y) {
            var out = new ArrayCtor(2);
            out[0] = x || 0;
            out[1] = y || 0;
            return out;
        },
        copy: function (out, v) {
            out[0] = v[0];
            out[1] = v[1];
            return out;
        },
        clone: function (v) {
            var out = new ArrayCtor(2);
            out[0] = v[0];
            out[1] = v[1];
            return out;
        },
        set: function (out, a, b) {
            out[0] = a;
            out[1] = b;
            return out;
        },
        add: function (out, v1, v2) {
            out[0] = v1[0] + v2[0];
            out[1] = v1[1] + v2[1];
            return out;
        },
        scaleAndAdd: function (out, v1, v2, a) {
            out[0] = v1[0] + v2[0] * a;
            out[1] = v1[1] + v2[1] * a;
            return out;
        },
        sub: function (out, v1, v2) {
            out[0] = v1[0] - v2[0];
            out[1] = v1[1] - v2[1];
            return out;
        },
        len: function (v) {
            return Math.sqrt(this.lenSquare(v));
        },
        lenSquare: function (v) {
            return v[0] * v[0] + v[1] * v[1];
        },
        mul: function (out, v1, v2) {
            out[0] = v1[0] * v2[0];
            out[1] = v1[1] * v2[1];
            return out;
        },
        div: function (out, v1, v2) {
            out[0] = v1[0] / v2[0];
            out[1] = v1[1] / v2[1];
            return out;
        },
        dot: function (v1, v2) {
            return v1[0] * v2[0] + v1[1] * v2[1];
        },
        scale: function (out, v, s) {
            out[0] = v[0] * s;
            out[1] = v[1] * s;
            return out;
        },
        normalize: function (out, v) {
            var d = vector.len(v);
            if (d === 0) {
                out[0] = 0;
                out[1] = 0;
            } else {
                out[0] = v[0] / d;
                out[1] = v[1] / d;
            }
            return out;
        },
        distance: function (v1, v2) {
            return Math.sqrt((v1[0] - v2[0]) * (v1[0] - v2[0]) + (v1[1] - v2[1]) * (v1[1] - v2[1]));
        },
        distanceSquare: function (v1, v2) {
            return (v1[0] - v2[0]) * (v1[0] - v2[0]) + (v1[1] - v2[1]) * (v1[1] - v2[1]);
        },
        negate: function (out, v) {
            out[0] = -v[0];
            out[1] = -v[1];
            return out;
        },
        lerp: function (out, v1, v2, t) {
            out[0] = v1[0] + t * (v2[0] - v1[0]);
            out[1] = v1[1] + t * (v2[1] - v1[1]);
            return out;
        },
        applyTransform: function (out, v, m) {
            var x = v[0];
            var y = v[1];
            out[0] = m[0] * x + m[2] * y + m[4];
            out[1] = m[1] * x + m[3] * y + m[5];
            return out;
        },
        min: function (out, v1, v2) {
            out[0] = Math.min(v1[0], v2[0]);
            out[1] = Math.min(v1[1], v2[1]);
            return out;
        },
        max: function (out, v1, v2) {
            out[0] = Math.max(v1[0], v2[0]);
            out[1] = Math.max(v1[1], v2[1]);
            return out;
        }
    };
    vector.length = vector.len;
    vector.lengthSquare = vector.lenSquare;
    vector.dist = vector.distance;
    vector.distSquare = vector.distanceSquare;
    return vector;
});define('zrender/tool/matrix', [], function () {
    var ArrayCtor = typeof Float32Array === 'undefined' ? Array : Float32Array;
    var matrix = {
        create: function () {
            var out = new ArrayCtor(6);
            matrix.identity(out);
            return out;
        },
        identity: function (out) {
            out[0] = 1;
            out[1] = 0;
            out[2] = 0;
            out[3] = 1;
            out[4] = 0;
            out[5] = 0;
            return out;
        },
        copy: function (out, m) {
            out[0] = m[0];
            out[1] = m[1];
            out[2] = m[2];
            out[3] = m[3];
            out[4] = m[4];
            out[5] = m[5];
            return out;
        },
        mul: function (out, m1, m2) {
            out[0] = m1[0] * m2[0] + m1[2] * m2[1];
            out[1] = m1[1] * m2[0] + m1[3] * m2[1];
            out[2] = m1[0] * m2[2] + m1[2] * m2[3];
            out[3] = m1[1] * m2[2] + m1[3] * m2[3];
            out[4] = m1[0] * m2[4] + m1[2] * m2[5] + m1[4];
            out[5] = m1[1] * m2[4] + m1[3] * m2[5] + m1[5];
            return out;
        },
        translate: function (out, a, v) {
            out[0] = a[0];
            out[1] = a[1];
            out[2] = a[2];
            out[3] = a[3];
            out[4] = a[4] + v[0];
            out[5] = a[5] + v[1];
            return out;
        },
        rotate: function (out, a, rad) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            var st = Math.sin(rad);
            var ct = Math.cos(rad);
            out[0] = aa * ct + ab * st;
            out[1] = -aa * st + ab * ct;
            out[2] = ac * ct + ad * st;
            out[3] = -ac * st + ct * ad;
            out[4] = ct * atx + st * aty;
            out[5] = ct * aty - st * atx;
            return out;
        },
        scale: function (out, a, v) {
            var vx = v[0];
            var vy = v[1];
            out[0] = a[0] * vx;
            out[1] = a[1] * vy;
            out[2] = a[2] * vx;
            out[3] = a[3] * vy;
            out[4] = a[4] * vx;
            out[5] = a[5] * vy;
            return out;
        },
        invert: function (out, a) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            var det = aa * ad - ab * ac;
            if (!det) {
                return null;
            }
            det = 1 / det;
            out[0] = ad * det;
            out[1] = -ab * det;
            out[2] = -ac * det;
            out[3] = aa * det;
            out[4] = (ac * aty - ad * atx) * det;
            out[5] = (ab * atx - aa * aty) * det;
            return out;
        },
        mulVector: function (out, a, v) {
            var aa = a[0];
            var ac = a[2];
            var atx = a[4];
            var ab = a[1];
            var ad = a[3];
            var aty = a[5];
            out[0] = v[0] * aa + v[1] * ac + atx;
            out[1] = v[0] * ab + v[1] * ad + aty;
            return out;
        }
    };
    return matrix;
});define('zrender/loadingEffect/Base', [
    'require',
    '../tool/util',
    '../shape/Text',
    '../shape/Rectangle'
], function (require) {
    var util = require('../tool/util');
    var TextShape = require('../shape/Text');
    var RectangleShape = require('../shape/Rectangle');
    var DEFAULT_TEXT = 'Loading...';
    var DEFAULT_TEXT_FONT = 'normal 16px Arial';
    function Base(options) {
        this.setOptions(options);
    }
    Base.prototype.createTextShape = function (textStyle) {
        return new TextShape({
            highlightStyle: util.merge({
                x: this.canvasWidth / 2,
                y: this.canvasHeight / 2,
                text: DEFAULT_TEXT,
                textAlign: 'center',
                textBaseline: 'middle',
                textFont: DEFAULT_TEXT_FONT,
                color: '#333',
                brushType: 'fill'
            }, textStyle, true)
        });
    };
    Base.prototype.createBackgroundShape = function (color) {
        return new RectangleShape({
            highlightStyle: {
                x: 0,
                y: 0,
                width: this.canvasWidth,
                height: this.canvasHeight,
                brushType: 'fill',
                color: color
            }
        });
    };
    Base.prototype.start = function (painter) {
        this.canvasWidth = painter._width;
        this.canvasHeight = painter._height;
        function addShapeHandle(param) {
            painter.storage.addHover(param);
        }
        function refreshHandle() {
            painter.refreshHover();
        }
        this.loadingTimer = this._start(addShapeHandle, refreshHandle);
    };
    Base.prototype._start = function () {
        return setInterval(function () {
        }, 10000);
    };
    Base.prototype.stop = function () {
        clearInterval(this.loadingTimer);
    };
    Base.prototype.setOptions = function (options) {
        this.options = options || {};
    };
    Base.prototype.adjust = function (value, region) {
        if (value <= region[0]) {
            value = region[0];
        } else if (value >= region[1]) {
            value = region[1];
        }
        return value;
    };
    Base.prototype.getLocation = function (loc, totalWidth, totalHeight) {
        var x = loc.x != null ? loc.x : 'center';
        switch (x) {
            case 'center':
                x = Math.floor((this.canvasWidth - totalWidth) / 2);
                break;
            case 'left':
                x = 0;
                break;
            case 'right':
                x = this.canvasWidth - totalWidth;
                break;
        }
        var y = loc.y != null ? loc.y : 'center';
        switch (y) {
            case 'center':
                y = Math.floor((this.canvasHeight - totalHeight) / 2);
                break;
            case 'top':
                y = 0;
                break;
            case 'bottom':
                y = this.canvasHeight - totalHeight;
                break;
        }
        return {
            x: x,
            y: y,
            width: totalWidth,
            height: totalHeight
        };
    };
    return Base;
});define('zrender/Layer', [
    'require',
    './mixin/Transformable',
    './tool/util',
    './config'
], function (require) {
    var Transformable = require('./mixin/Transformable');
    var util = require('./tool/util');
    var config = require('./config');
    function returnFalse() {
        return false;
    }
    function createDom(id, type, painter) {
        var newDom = document.createElement(type);
        var width = painter.getWidth();
        var height = painter.getHeight();
        newDom.style.position = 'absolute';
        newDom.style.left = 0;
        newDom.style.top = 0;
        newDom.style.width = width + 'px';
        newDom.style.height = height + 'px';
        newDom.width = width * config.devicePixelRatio;
        newDom.height = height * config.devicePixelRatio;
        newDom.setAttribute('data-zr-dom-id', id);
        return newDom;
    }
    var Layer = function (id, painter) {
        this.id = id;
        this.dom = createDom(id, 'canvas', painter);
        this.dom.onselectstart = returnFalse;
        this.dom.style['-webkit-user-select'] = 'none';
        this.dom.style['user-select'] = 'none';
        this.dom.style['-webkit-touch-callout'] = 'none';
        this.dom.style['-webkit-tap-highlight-color'] = 'rgba(0,0,0,0)';
        this.domBack = null;
        this.ctxBack = null;
        this.painter = painter;
        this.unusedCount = 0;
        this.config = null;
        this.dirty = true;
        this.elCount = 0;
        this.clearColor = 0;
        this.motionBlur = false;
        this.lastFrameAlpha = 0.7;
        this.zoomable = false;
        this.panable = false;
        this.maxZoom = Infinity;
        this.minZoom = 0;
        Transformable.call(this);
    };
    Layer.prototype.initContext = function () {
        this.ctx = this.dom.getContext('2d');
        var dpr = config.devicePixelRatio;
        if (dpr != 1) {
            this.ctx.scale(dpr, dpr);
        }
    };
    Layer.prototype.createBackBuffer = function () {
        this.domBack = createDom('back-' + this.id, 'canvas', this.painter);
        this.ctxBack = this.domBack.getContext('2d');
        var dpr = config.devicePixelRatio;
        if (dpr != 1) {
            this.ctxBack.scale(dpr, dpr);
        }
    };
    Layer.prototype.resize = function (width, height) {
        var dpr = config.devicePixelRatio;
        this.dom.style.width = width + 'px';
        this.dom.style.height = height + 'px';
        this.dom.setAttribute('width', width * dpr);
        this.dom.setAttribute('height', height * dpr);
        if (dpr != 1) {
            this.ctx.scale(dpr, dpr);
        }
        if (this.domBack) {
            this.domBack.setAttribute('width', width * dpr);
            this.domBack.setAttribute('height', height * dpr);
            if (dpr != 1) {
                this.ctxBack.scale(dpr, dpr);
            }
        }
    };
    Layer.prototype.clear = function () {
        var dom = this.dom;
        var ctx = this.ctx;
        var width = dom.width;
        var height = dom.height;
        var haveClearColor = this.clearColor;
        var haveMotionBLur = this.motionBlur;
        var lastFrameAlpha = this.lastFrameAlpha;
        var dpr = config.devicePixelRatio;
        if (haveMotionBLur) {
            if (!this.domBack) {
                this.createBackBuffer();
            }
            this.ctxBack.globalCompositeOperation = 'copy';
            this.ctxBack.drawImage(dom, 0, 0, width / dpr, height / dpr);
        }
        ctx.clearRect(0, 0, width / dpr, height / dpr);
        if (haveClearColor) {
            ctx.save();
            ctx.fillStyle = this.clearColor;
            ctx.fillRect(0, 0, width / dpr, height / dpr);
            ctx.restore();
        }
        if (haveMotionBLur) {
            var domBack = this.domBack;
            ctx.save();
            ctx.globalAlpha = lastFrameAlpha;
            ctx.drawImage(domBack, 0, 0, width / dpr, height / dpr);
            ctx.restore();
        }
    };
    util.merge(Layer.prototype, Transformable.prototype);
    return Layer;
});define('zrender/shape/Text', [
    'require',
    '../tool/area',
    './Base',
    '../tool/util'
], function (require) {
    var area = require('../tool/area');
    var Base = require('./Base');
    var Text = function (options) {
        Base.call(this, options);
    };
    Text.prototype = {
        type: 'text',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            if (typeof style.text == 'undefined' || style.text === false) {
                return;
            }
            ctx.save();
            this.doClip(ctx);
            this.setContext(ctx, style);
            this.setTransform(ctx);
            if (style.textFont) {
                ctx.font = style.textFont;
            }
            ctx.textAlign = style.textAlign || 'start';
            ctx.textBaseline = style.textBaseline || 'middle';
            var text = (style.text + '').split('\n');
            // var lineHeight = area.getTextHeight('国', style.textFont);
            var lineHeight = 14; //modified by jswang
            var rect = this.getRect(style);
            var x = style.x;
            var y;
            if (style.textBaseline == 'top') {
                y = rect.y;
            } else if (style.textBaseline == 'bottom') {
                y = rect.y + lineHeight;
            } else {
                y = rect.y + lineHeight / 2;
            }
            for (var i = 0, l = text.length; i < l; i++) {
                if (style.maxWidth) {
                    switch (style.brushType) {
                        case 'fill':
                            ctx.fillText(text[i], x, y, style.maxWidth);
                            break;
                        case 'stroke':
                            ctx.strokeText(text[i], x, y, style.maxWidth);
                            break;
                        case 'both':
                            ctx.fillText(text[i], x, y, style.maxWidth);
                            ctx.strokeText(text[i], x, y, style.maxWidth);
                            break;
                        default:
                            ctx.fillText(text[i], x, y, style.maxWidth);
                    }
                } else {
                    switch (style.brushType) {
                        case 'fill':
                            ctx.fillText(text[i], x, y);
                            break;
                        case 'stroke':
                            ctx.strokeText(text[i], x, y);
                            break;
                        case 'both':
                            ctx.fillText(text[i], x, y);
                            ctx.strokeText(text[i], x, y);
                            break;
                        default:
                            ctx.fillText(text[i], x, y);
                    }
                }
                y += lineHeight;
            }
            ctx.restore();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var width = area.getTextWidth(style.text, style.textFont);
            var height = area.getTextHeight(style.text, style.textFont);
            var textX = style.x;
            if (style.textAlign == 'end' || style.textAlign == 'right') {
                textX -= width;
            } else if (style.textAlign == 'center') {
                textX -= width / 2;
            }
            var textY;
            if (style.textBaseline == 'top') {
                textY = style.y;
            } else if (style.textBaseline == 'bottom') {
                textY = style.y - height;
            } else {
                textY = style.y - height / 2;
            }
            style.__rect = {
                x: textX,
                y: textY,
                width: width,
                height: height
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Text, Base);
    return Text;
});define('zrender/shape/Rectangle', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var Rectangle = function (options) {
        Base.call(this, options);
    };
    Rectangle.prototype = {
        type: 'rectangle',
        _buildRadiusPath: function (ctx, style) {
            var x = style.x;
            var y = style.y;
            var width = style.width;
            var height = style.height;
            var r = style.radius;
            var r1;
            var r2;
            var r3;
            var r4;
            if (typeof r === 'number') {
                r1 = r2 = r3 = r4 = r;
            } else if (r instanceof Array) {
                if (r.length === 1) {
                    r1 = r2 = r3 = r4 = r[0];
                } else if (r.length === 2) {
                    r1 = r3 = r[0];
                    r2 = r4 = r[1];
                } else if (r.length === 3) {
                    r1 = r[0];
                    r2 = r4 = r[1];
                    r3 = r[2];
                } else {
                    r1 = r[0];
                    r2 = r[1];
                    r3 = r[2];
                    r4 = r[3];
                }
            } else {
                r1 = r2 = r3 = r4 = 0;
            }
            var total;
            if (r1 + r2 > width) {
                total = r1 + r2;
                r1 *= width / total;
                r2 *= width / total;
            }
            if (r3 + r4 > width) {
                total = r3 + r4;
                r3 *= width / total;
                r4 *= width / total;
            }
            if (r2 + r3 > height) {
                total = r2 + r3;
                r2 *= height / total;
                r3 *= height / total;
            }
            if (r1 + r4 > height) {
                total = r1 + r4;
                r1 *= height / total;
                r4 *= height / total;
            }
            ctx.moveTo(x + r1, y);
            ctx.lineTo(x + width - r2, y);
            r2 !== 0 && ctx.quadraticCurveTo(x + width, y, x + width, y + r2);
            ctx.lineTo(x + width, y + height - r3);
            r3 !== 0 && ctx.quadraticCurveTo(x + width, y + height, x + width - r3, y + height);
            ctx.lineTo(x + r4, y + height);
            r4 !== 0 && ctx.quadraticCurveTo(x, y + height, x, y + height - r4);
            ctx.lineTo(x, y + r1);
            r1 !== 0 && ctx.quadraticCurveTo(x, y, x + r1, y);
        },
        buildPath: function (ctx, style) {
            if (!style.radius) {
                ctx.moveTo(style.x, style.y);
                ctx.lineTo(style.x + style.width, style.y);
                ctx.lineTo(style.x + style.width, style.y + style.height);
                ctx.lineTo(style.x, style.y + style.height);
                ctx.lineTo(style.x, style.y);
            } else {
                this._buildRadiusPath(ctx, style);
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - lineWidth / 2),
                y: Math.round(style.y - lineWidth / 2),
                width: style.width + lineWidth,
                height: style.height + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Rectangle, Base);
    return Rectangle;
});define('zrender/tool/area', [
    'require',
    './util',
    './curve'
], function (require) {
    'use strict';
    var util = require('./util');
    var curve = require('./curve');
    var _ctx;
    var _textWidthCache = {};
    var _textHeightCache = {};
    var _textWidthCacheCounter = 0;
    var _textHeightCacheCounter = 0;
    var TEXT_CACHE_MAX = 5000;
    var PI2 = Math.PI * 2;
    function normalizeRadian(angle) {
        angle %= PI2;
        if (angle < 0) {
            angle += PI2;
        }
        return angle;
    }
    function isInside(shape, area, x, y) {
        if (!area || !shape) {
            return false;
        }
        var zoneType = shape.type;
        _ctx = _ctx || util.getContext();
        var _mathReturn = _mathMethod(shape, area, x, y);
        if (typeof _mathReturn != 'undefined') {
            return _mathReturn;
        }
        if (shape.buildPath && _ctx.isPointInPath) {
            return _buildPathMethod(shape, _ctx, area, x, y);
        }
        switch (zoneType) {
            case 'ellipse':
                return true;
            case 'trochoid':
                var _r = area.location == 'out' ? area.r1 + area.r2 + area.d : area.r1 - area.r2 + area.d;
                return isInsideCircle(area, x, y, _r);
            case 'rose':
                return isInsideCircle(area, x, y, area.maxr);
            default:
                return false;
        }
    }
    function _mathMethod(shape, area, x, y) {
        var zoneType = shape.type;
        switch (zoneType) {
            case 'bezier-curve':
                if (typeof area.cpX2 === 'undefined') {
                    return isInsideQuadraticStroke(area.xStart, area.yStart, area.cpX1, area.cpY1, area.xEnd, area.yEnd, area.lineWidth, x, y);
                }
                return isInsideCubicStroke(area.xStart, area.yStart, area.cpX1, area.cpY1, area.cpX2, area.cpY2, area.xEnd, area.yEnd, area.lineWidth, x, y);
            case 'line':
                return isInsideLine(area.xStart, area.yStart, area.xEnd, area.yEnd, area.lineWidth, x, y);
            case 'polyline':
                return isInsidePolyline(area.pointList, area.lineWidth, x, y);
            case 'ring':
                return isInsideRing(area.x, area.y, area.r0, area.r, x, y);
            case 'circle':
                return isInsideCircle(area.x, area.y, area.r, x, y);
            case 'sector':
                var startAngle = area.startAngle * Math.PI / 180;
                var endAngle = area.endAngle * Math.PI / 180;
                if (!area.clockWise) {
                    startAngle = -startAngle;
                    endAngle = -endAngle;
                }
                return isInsideSector(area.x, area.y, area.r0, area.r, startAngle, endAngle, !area.clockWise, x, y);
            case 'path':
                return area.pathArray && isInsidePath(area.pathArray, Math.max(area.lineWidth, 5), area.brushType, x, y);
            case 'polygon':
            case 'star':
            case 'isogon':
                return isInsidePolygon(area.pointList, x, y);
            case 'text':
                var rect = area.__rect || shape.getRect(area);
                return isInsideRect(rect.x, rect.y, rect.width, rect.height, x, y);
            case 'rectangle':
            case 'image':
                return isInsideRect(area.x, area.y, area.width, area.height, x, y);
        }
    }
    function _buildPathMethod(shape, context, area, x, y) {
        context.beginPath();
        shape.buildPath(context, area);
        context.closePath();
        return context.isPointInPath(x, y);
    }
    function isOutside(shape, area, x, y) {
        return !isInside(shape, area, x, y);
    }
    function isInsideLine(x0, y0, x1, y1, lineWidth, x, y) {
        if (lineWidth === 0) {
            return false;
        }
        var _l = Math.max(lineWidth, 5);
        var _a = 0;
        var _b = x0;
        if (y > y0 + _l && y > y1 + _l || y < y0 - _l && y < y1 - _l || x > x0 + _l && x > x1 + _l || x < x0 - _l && x < x1 - _l) {
            return false;
        }
        if (x0 !== x1) {
            _a = (y0 - y1) / (x0 - x1);
            _b = (x0 * y1 - x1 * y0) / (x0 - x1);
        } else {
            return Math.abs(x - x0) <= _l / 2;
        }
        var tmp = _a * x - y + _b;
        var _s = tmp * tmp / (_a * _a + 1);
        return _s <= _l / 2 * _l / 2;
    }
    function isInsideCubicStroke(x0, y0, x1, y1, x2, y2, x3, y3, lineWidth, x, y) {
        if (lineWidth === 0) {
            return false;
        }
        var _l = Math.max(lineWidth, 5);
        if (y > y0 + _l && y > y1 + _l && y > y2 + _l && y > y3 + _l || y < y0 - _l && y < y1 - _l && y < y2 - _l && y < y3 - _l || x > x0 + _l && x > x1 + _l && x > x2 + _l && x > x3 + _l || x < x0 - _l && x < x1 - _l && x < x2 - _l && x < x3 - _l) {
            return false;
        }
        var d = curve.cubicProjectPoint(x0, y0, x1, y1, x2, y2, x3, y3, x, y, null);
        return d <= _l / 2;
    }
    function isInsideQuadraticStroke(x0, y0, x1, y1, x2, y2, lineWidth, x, y) {
        if (lineWidth === 0) {
            return false;
        }
        var _l = Math.max(lineWidth, 5);
        if (y > y0 + _l && y > y1 + _l && y > y2 + _l || y < y0 - _l && y < y1 - _l && y < y2 - _l || x > x0 + _l && x > x1 + _l && x > x2 + _l || x < x0 - _l && x < x1 - _l && x < x2 - _l) {
            return false;
        }
        var d = curve.quadraticProjectPoint(x0, y0, x1, y1, x2, y2, x, y, null);
        return d <= _l / 2;
    }
    function isInsideArcStroke(cx, cy, r, startAngle, endAngle, anticlockwise, lineWidth, x, y) {
        if (lineWidth === 0) {
            return false;
        }
        var _l = Math.max(lineWidth, 5);
        x -= cx;
        y -= cy;
        var d = Math.sqrt(x * x + y * y);
        if (d - _l > r || d + _l < r) {
            return false;
        }
        if (Math.abs(startAngle - endAngle) >= PI2) {
            return true;
        }
        if (anticlockwise) {
            var tmp = startAngle;
            startAngle = normalizeRadian(endAngle);
            endAngle = normalizeRadian(tmp);
        } else {
            startAngle = normalizeRadian(startAngle);
            endAngle = normalizeRadian(endAngle);
        }
        if (startAngle > endAngle) {
            endAngle += PI2;
        }
        var angle = Math.atan2(y, x);
        if (angle < 0) {
            angle += PI2;
        }
        return angle >= startAngle && angle <= endAngle || angle + PI2 >= startAngle && angle + PI2 <= endAngle;
    }
    function isInsidePolyline(points, lineWidth, x, y) {
        var lineWidth = Math.max(lineWidth, 10);
        for (var i = 0, l = points.length - 1; i < l; i++) {
            var x0 = points[i][0];
            var y0 = points[i][1];
            var x1 = points[i + 1][0];
            var y1 = points[i + 1][1];
            if (isInsideLine(x0, y0, x1, y1, lineWidth, x, y)) {
                return true;
            }
        }
        return false;
    }
    function isInsideRing(cx, cy, r0, r, x, y) {
        var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        return d < r * r && d > r0 * r0;
    }
    function isInsideRect(x0, y0, width, height, x, y) {
        return x >= x0 && x <= x0 + width && y >= y0 && y <= y0 + height;
    }
    function isInsideCircle(x0, y0, r, x, y) {
        return (x - x0) * (x - x0) + (y - y0) * (y - y0) < r * r;
    }
    function isInsideSector(cx, cy, r0, r, startAngle, endAngle, anticlockwise, x, y) {
        return isInsideArcStroke(cx, cy, (r0 + r) / 2, startAngle, endAngle, anticlockwise, r - r0, x, y);
    }
    function isInsidePolygon(points, x, y) {
        var N = points.length;
        var w = 0;
        for (var i = 0, j = N - 1; i < N; i++) {
            var x0 = points[j][0];
            var y0 = points[j][1];
            var x1 = points[i][0];
            var y1 = points[i][1];
            w += windingLine(x0, y0, x1, y1, x, y);
            j = i;
        }
        return w !== 0;
    }
    function windingLine(x0, y0, x1, y1, x, y) {
        if (y > y0 && y > y1 || y < y0 && y < y1) {
            return 0;
        }
        if (y1 == y0) {
            return 0;
        }
        var dir = y1 < y0 ? 1 : -1;
        var t = (y - y0) / (y1 - y0);
        var x_ = t * (x1 - x0) + x0;
        return x_ > x ? dir : 0;
    }
    var roots = [
        -1,
        -1,
        -1
    ];
    var extrema = [
        -1,
        -1
    ];
    function swapExtrema() {
        var tmp = extrema[0];
        extrema[0] = extrema[1];
        extrema[1] = tmp;
    }
    function windingCubic(x0, y0, x1, y1, x2, y2, x3, y3, x, y) {
        if (y > y0 && y > y1 && y > y2 && y > y3 || y < y0 && y < y1 && y < y2 && y < y3) {
            return 0;
        }
        var nRoots = curve.cubicRootAt(y0, y1, y2, y3, y, roots);
        if (nRoots === 0) {
            return 0;
        } else {
            var w = 0;
            var nExtrema = -1;
            var y0_, y1_;
            for (var i = 0; i < nRoots; i++) {
                var t = roots[i];
                var x_ = curve.cubicAt(x0, x1, x2, x3, t);
                if (x_ < x) {
                    continue;
                }
                if (nExtrema < 0) {
                    nExtrema = curve.cubicExtrema(y0, y1, y2, y3, extrema);
                    if (extrema[1] < extrema[0] && nExtrema > 1) {
                        swapExtrema();
                    }
                    y0_ = curve.cubicAt(y0, y1, y2, y3, extrema[0]);
                    if (nExtrema > 1) {
                        y1_ = curve.cubicAt(y0, y1, y2, y3, extrema[1]);
                    }
                }
                if (nExtrema == 2) {
                    if (t < extrema[0]) {
                        w += y0_ < y0 ? 1 : -1;
                    } else if (t < extrema[1]) {
                        w += y1_ < y0_ ? 1 : -1;
                    } else {
                        w += y3 < y1_ ? 1 : -1;
                    }
                } else {
                    if (t < extrema[0]) {
                        w += y0_ < y0 ? 1 : -1;
                    } else {
                        w += y3 < y0_ ? 1 : -1;
                    }
                }
            }
            return w;
        }
    }
    function windingQuadratic(x0, y0, x1, y1, x2, y2, x, y) {
        if (y > y0 && y > y1 && y > y2 || y < y0 && y < y1 && y < y2) {
            return 0;
        }
        var nRoots = curve.quadraticRootAt(y0, y1, y2, y, roots);
        if (nRoots === 0) {
            return 0;
        } else {
            var t = curve.quadraticExtremum(y0, y1, y2);
            if (t >= 0 && t <= 1) {
                var w = 0;
                var y_ = curve.quadraticAt(y0, y1, y2, t);
                for (var i = 0; i < nRoots; i++) {
                    var x_ = curve.quadraticAt(x0, x1, x2, roots[i]);
                    if (x_ < x) {
                        continue;
                    }
                    if (roots[i] < t) {
                        w += y_ < y0 ? 1 : -1;
                    } else {
                        w += y2 < y_ ? 1 : -1;
                    }
                }
                return w;
            } else {
                var x_ = curve.quadraticAt(x0, x1, x2, roots[0]);
                if (x_ < x) {
                    return 0;
                }
                return y2 < y0 ? 1 : -1;
            }
        }
    }
    function windingArc(cx, cy, r, startAngle, endAngle, anticlockwise, x, y) {
        y -= cy;
        if (y > r || y < -r) {
            return 0;
        }
        var tmp = Math.sqrt(r * r - y * y);
        roots[0] = -tmp;
        roots[1] = tmp;
        if (Math.abs(startAngle - endAngle) >= PI2) {
            startAngle = 0;
            endAngle = PI2;
            var dir = anticlockwise ? 1 : -1;
            if (x >= roots[0] + cx && x <= roots[1] + cx) {
                return dir;
            } else {
                return 0;
            }
        }
        if (anticlockwise) {
            var tmp = startAngle;
            startAngle = normalizeRadian(endAngle);
            endAngle = normalizeRadian(tmp);
        } else {
            startAngle = normalizeRadian(startAngle);
            endAngle = normalizeRadian(endAngle);
        }
        if (startAngle > endAngle) {
            endAngle += PI2;
        }
        var w = 0;
        for (var i = 0; i < 2; i++) {
            var x_ = roots[i];
            if (x_ + cx > x) {
                var angle = Math.atan2(y, x_);
                var dir = anticlockwise ? 1 : -1;
                if (angle < 0) {
                    angle = PI2 + angle;
                }
                if (angle >= startAngle && angle <= endAngle || angle + PI2 >= startAngle && angle + PI2 <= endAngle) {
                    if (angle > Math.PI / 2 && angle < Math.PI * 1.5) {
                        dir = -dir;
                    }
                    w += dir;
                }
            }
        }
        return w;
    }
    function isInsidePath(pathArray, lineWidth, brushType, x, y) {
        var w = 0;
        var xi = 0;
        var yi = 0;
        var x0 = 0;
        var y0 = 0;
        var beginSubpath = true;
        var firstCmd = true;
        brushType = brushType || 'fill';
        var hasStroke = brushType === 'stroke' || brushType === 'both';
        var hasFill = brushType === 'fill' || brushType === 'both';
        for (var i = 0; i < pathArray.length; i++) {
            var seg = pathArray[i];
            var p = seg.points;
            if (beginSubpath || seg.command === 'M') {
                if (i > 0) {
                    if (hasFill) {
                        w += windingLine(xi, yi, x0, y0, x, y);
                    }
                    if (w !== 0) {
                        return true;
                    }
                }
                x0 = p[p.length - 2];
                y0 = p[p.length - 1];
                beginSubpath = false;
                if (firstCmd && seg.command !== 'A') {
                    firstCmd = false;
                    xi = x0;
                    yi = y0;
                }
            }
            switch (seg.command) {
                case 'M':
                    xi = p[0];
                    yi = p[1];
                    break;
                case 'L':
                    if (hasStroke) {
                        if (isInsideLine(xi, yi, p[0], p[1], lineWidth, x, y)) {
                            return true;
                        }
                    }
                    if (hasFill) {
                        w += windingLine(xi, yi, p[0], p[1], x, y);
                    }
                    xi = p[0];
                    yi = p[1];
                    break;
                case 'C':
                    if (hasStroke) {
                        if (isInsideCubicStroke(xi, yi, p[0], p[1], p[2], p[3], p[4], p[5], lineWidth, x, y)) {
                            return true;
                        }
                    }
                    if (hasFill) {
                        w += windingCubic(xi, yi, p[0], p[1], p[2], p[3], p[4], p[5], x, y);
                    }
                    xi = p[4];
                    yi = p[5];
                    break;
                case 'Q':
                    if (hasStroke) {
                        if (isInsideQuadraticStroke(xi, yi, p[0], p[1], p[2], p[3], lineWidth, x, y)) {
                            return true;
                        }
                    }
                    if (hasFill) {
                        w += windingQuadratic(xi, yi, p[0], p[1], p[2], p[3], x, y);
                    }
                    xi = p[2];
                    yi = p[3];
                    break;
                case 'A':
                    var cx = p[0];
                    var cy = p[1];
                    var rx = p[2];
                    var ry = p[3];
                    var theta = p[4];
                    var dTheta = p[5];
                    var x1 = Math.cos(theta) * rx + cx;
                    var y1 = Math.sin(theta) * ry + cy;
                    if (!firstCmd) {
                        w += windingLine(xi, yi, x1, y1);
                    } else {
                        firstCmd = false;
                        x0 = x1;
                        y0 = y1;
                    }
                    var _x = (x - cx) * ry / rx + cx;
                    if (hasStroke) {
                        if (isInsideArcStroke(cx, cy, ry, theta, theta + dTheta, 1 - p[7], lineWidth, _x, y)) {
                            return true;
                        }
                    }
                    if (hasFill) {
                        w += windingArc(cx, cy, ry, theta, theta + dTheta, 1 - p[7], _x, y);
                    }
                    xi = Math.cos(theta + dTheta) * rx + cx;
                    yi = Math.sin(theta + dTheta) * ry + cy;
                    break;
                case 'z':
                    if (hasStroke) {
                        if (isInsideLine(xi, yi, x0, y0, lineWidth, x, y)) {
                            return true;
                        }
                    }
                    beginSubpath = true;
                    break;
            }
        }
        if (hasFill) {
            w += windingLine(xi, yi, x0, y0, x, y);
        }
        return w !== 0;
    }
    function getTextWidth(text, textFont) {
        var key = text + ':' + textFont;
        if (_textWidthCache[key]) {
            return _textWidthCache[key];
        }
        _ctx = _ctx || util.getContext();
        _ctx.save();
        if (textFont) {
            _ctx.font = textFont;
        }
        text = (text + '').split('\n');
        var width = 0;
        for (var i = 0, l = text.length; i < l; i++) {
            width = Math.max(_ctx.measureText(text[i]).width, width);
        }
        _ctx.restore();
        _textWidthCache[key] = width;
        if (++_textWidthCacheCounter > TEXT_CACHE_MAX) {
            _textWidthCacheCounter = 0;
            _textWidthCache = {};
        }
        return width;
    }
    function getTextHeight(text, textFont) {
        var key = text + ':' + textFont;
        if (_textHeightCache[key]) {
            return _textHeightCache[key];
        }
        _ctx = _ctx || util.getContext();
        _ctx.save();
        if (textFont) {
            _ctx.font = textFont;
        }
        text = (text + '').split('\n');
        var height = (_ctx.measureText('国').width + 2) * text.length;
        _ctx.restore();
        _textHeightCache[key] = height;
        if (++_textHeightCacheCounter > TEXT_CACHE_MAX) {
            _textHeightCacheCounter = 0;
            _textHeightCache = {};
        }
        return height;
    }
    return {
        isInside: isInside,
        isOutside: isOutside,
        getTextWidth: getTextWidth,
        getTextHeight: getTextHeight,
        isInsidePath: isInsidePath,
        isInsidePolygon: isInsidePolygon,
        isInsideSector: isInsideSector,
        isInsideCircle: isInsideCircle,
        isInsideLine: isInsideLine,
        isInsideRect: isInsideRect,
        isInsidePolyline: isInsidePolyline,
        isInsideCubicStroke: isInsideCubicStroke,
        isInsideQuadraticStroke: isInsideQuadraticStroke
    };
});define('zrender/shape/Base', [
    'require',
    '../tool/matrix',
    '../tool/guid',
    '../tool/util',
    '../tool/log',
    '../mixin/Transformable',
    '../mixin/Eventful',
    '../tool/area',
    '../tool/color'
], function (require) {
    var matrix = require('../tool/matrix');
    var guid = require('../tool/guid');
    var util = require('../tool/util');
    var log = require('../tool/log');
    var Transformable = require('../mixin/Transformable');
    var Eventful = require('../mixin/Eventful');
    var zrArea = require('zrender/tool/area');
    function _fillText(ctx, text, x, y, textFont, textAlign, textBaseline) {
        if (textFont) {
            ctx.font = textFont;
        }
        ctx.textAlign = textAlign;
        ctx.textBaseline = textBaseline;
        var rect = _getTextRect(text, x, y, textFont, textAlign, textBaseline);
        text = text + '';
        // var lineHeight = require('../tool/area').getTextHeight('国', textFont);
        var lineHeight = 14; //modified by jswang
        switch (textBaseline) {
            case 'top':
                y = rect.y;
                break;
            case 'bottom':
                y = rect.y + lineHeight;
                break;
            default:
                y = rect.y + lineHeight / 2;
        }
        // for (var i = 0, l = text.length; i < l; i++) {
        //     ctx.fillText(text[i], x, y);
        //     y += lineHeight;
        // }
        ctx.fillText(text, x, y);
    }
    function _getTextRect(text, x, y, textFont, textAlign, textBaseline) {
        var area = require('../tool/area');
        var width = area.getTextWidth(text, textFont);
        // var lineHeight = area.getTextHeight('国', textFont);
        var lineHeight = 14; //modified by jswang
        text = text + '';
        switch (textAlign) {
            case 'end':
            case 'right':
                x -= width;
                break;
            case 'center':
                x -= width / 2;
                break;
        }
        switch (textBaseline) {
            case 'top':
                break;
            case 'bottom':
                y -= lineHeight;
                break;
            default:
                y -= lineHeight/ 2;
        }
        return {
            x: x,
            y: y,
            width: width,
            height: lineHeight
        };
    }
    var Base = function (options) {
        options = options || {};
        this.id = options.id || guid();
        for (var key in options) {
            this[key] = options[key];
        }
        this.style = this.style || {};
        this.highlightStyle = this.highlightStyle || null;
        this.parent = null;
        this.__dirty = true;
        this.__clipShapes = [];
        Transformable.call(this);
        Eventful.call(this);
    };
    Base.prototype.invisible = false;
    Base.prototype.ignore = false;
    Base.prototype.zlevel = 0;
    Base.prototype.draggable = false;
    Base.prototype.clickable = false;
    Base.prototype.hoverable = true;
    Base.prototype.z = 0;
    Base.prototype.brush = function (ctx, isHighlight) {
        var style = this.beforeBrush(ctx, isHighlight);
        ctx.beginPath();
        this.buildPath(ctx, style);
        switch (style.brushType) {
            case 'both':
                ctx.fill();
            case 'stroke':
                style.lineWidth > 0 && ctx.stroke();
                break;
            default:
                ctx.fill();
        }
        /*
         用于多色显示连线文字
         modified by myyao on 17.05.24
         */
        if(!this.noText) {
            var _text = style.text;
            var _textColor = style.textColor;
            if (_text instanceof Array) {
                var that = this;
                _text.forEach(function(el, index){
                    style.text = el;
                    style.textColor = _textColor[index];
                    that.drawText(ctx, style, style, index, _text[1 - index]);
                });
                style.text = _text;
                style.textColor = _textColor;
            } else {
                this.drawText(ctx, style, this.style);
            }
        }
        // this.drawText(ctx, style, this.style);
        // 修改结束
        this.afterBrush(ctx);
    };
    Base.prototype.beforeBrush = function (ctx, isHighlight) {
        var style = this.style;
        if (this.brushTypeOnly) {
            style.brushType = this.brushTypeOnly;
        }
        if (isHighlight) {
            style = this.getHighlightStyle(style, this.highlightStyle || {}, this.brushTypeOnly);
        }
        if (this.brushTypeOnly == 'stroke') {
            style.strokeColor = style.strokeColor || style.color;
        }
        ctx.save();
        // this.doClip(ctx);  //deleted by jswang
        this.setContext(ctx, style);
        this.setTransform(ctx);
        return style;
    };
    Base.prototype.afterBrush = function (ctx) {
        ctx.restore();
    };
    var STYLE_CTX_MAP = [
        [
            'color',
            'fillStyle'
        ],
        [
            'strokeColor',
            'strokeStyle'
        ],
        [
            'lineWidth',
            'lineWidth'
        ],
    ];
    Base.prototype.setContext = function (ctx, style) {
        if(style.color) ctx.fillStyle = style.color;
        if(style.strokeColor) ctx.strokeStyle = style.strokeColor;
        if(style.lineWidth) ctx.lineWidth = style.lineWidth;
    };
    var clipShapeInvTransform = matrix.create();
    Base.prototype.doClip = function (ctx) {
        if (this.__clipShapes) {
            for (var i = 0; i < this.__clipShapes.length; i++) {
                var clipShape = this.__clipShapes[i];
                if (clipShape.needTransform) {
                    var m = clipShape.transform;
                    matrix.invert(clipShapeInvTransform, m);
                    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
                }
                ctx.beginPath();
                clipShape.buildPath(ctx, clipShape.style);
                ctx.clip();
                if (clipShape.needTransform) {
                    var m = clipShapeInvTransform;
                    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
                }
            }
        }
    };
    Base.prototype.getHighlightStyle = function (style, highlightStyle, brushTypeOnly) {
        var newStyle = {};
        for (var k in style) {
            newStyle[k] = style[k];
        }
        var color = require('../tool/color');
        var highlightColor = color.getHighlightColor();
        if (style.brushType != 'stroke') {
            newStyle.strokeColor = highlightColor;
            newStyle.lineWidth = (style.lineWidth || 1) + this.getHighlightZoom();
            newStyle.brushType = 'both';
        } else {
            if (brushTypeOnly != 'stroke') {
                newStyle.strokeColor = highlightColor;
                newStyle.lineWidth = (style.lineWidth || 1) + this.getHighlightZoom();
            } else {
                newStyle.strokeColor = highlightStyle.strokeColor || color.mix(style.strokeColor, color.toRGB(highlightColor));
            }
        }
        for (var k in highlightStyle) {
            if (typeof highlightStyle[k] != 'undefined') {
                newStyle[k] = highlightStyle[k];
            }
        }
        return newStyle;
    };
    Base.prototype.getHighlightZoom = function () {
        return this.type != 'text' ? 6 : 2;
    };
    Base.prototype.drift = function (dx, dy) {
        this.position[0] += dx;
        this.position[1] += dy;
    };
    Base.prototype.buildPath = function (ctx, style) {
        log('buildPath not implemented in ' + this.type);
    };
    Base.prototype.getRect = function (style) {
        log('getRect not implemented in ' + this.type);
    };
    Base.prototype.isCover = function (x, y) {
        var originPos = this.transformCoordToLocal(x, y);
        x = originPos[0];
        y = originPos[1];
        if (this.isCoverRect(x, y)) {
            return require('../tool/area').isInside(this, this.style, x, y);
        }
        return false;
    };
    Base.prototype.isCoverRect = function (x, y) {
        var rect = this.style.__rect;
        if (!rect) {
            rect = this.style.__rect = this.getRect(this.style);
        }
        return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    };
    Base.prototype.drawText = function (ctx, style, normalStyle, thisIndex, otherText) {
        if (typeof style.text == 'undefined' || style.text === false) {
            return;
        }
        var textColor = style.textColor || style.color || style.strokeColor;
        ctx.fillStyle = textColor;
        var dd = 10;
        var al;
        var bl;
        var tx;
        var ty;
        var textPosition = style.textPosition || this.textPosition || 'top';
        switch (textPosition) {
            case 'inside':
            case 'top':
            case 'bottom':
            case 'left':
            case 'right':
                var getRect = this.getRect;
                if (getRect) {
                    var rect = (normalStyle || style).__rect || getRect(normalStyle || style);
                    switch (textPosition) {
                        case 'inside':
                            tx = rect.x + rect.width / 2;
                            ty = rect.y + rect.height / 2;
                            al = 'center';
                            bl = 'middle';
                            if (style.brushType != 'stroke' && textColor == style.color) {
                                ctx.fillStyle = '#fff';
                            }
                            break;
                        case 'left':
                            tx = rect.x - dd;
                            ty = rect.y + rect.height / 2;
                            al = 'end';
                            bl = 'middle';
                            break;
                        case 'right':
                            tx = rect.x + rect.width + dd;
                            ty = rect.y + rect.height / 2;
                            al = 'start';
                            bl = 'middle';
                            break;
                        case 'top':
                            tx = rect.x + rect.width / 2;
                            ty = rect.y - dd;
                            al = 'center';
                            bl = 'bottom';
                            break;
                        case 'bottom':
                            tx = rect.x + rect.width / 2;
                            ty = rect.y + rect.height + dd;
                            al = 'center';
                            bl = 'top';
                            break;
                    }
                }
                break;
            case 'start':
            case 'end':
                var pointList = style.pointList || [
                        [
                            style.xStart || 0,
                            style.yStart || 0
                        ],
                        [
                            style.xEnd || 0,
                            style.yEnd || 0
                        ]
                    ];
                var length = pointList.length;
                if (length < 2) {
                    return;
                }
                var xStart;
                var xEnd;
                var yStart;
                var yEnd;
                switch (textPosition) {
                    case 'start':
                        xStart = pointList[1][0];
                        xEnd = pointList[0][0];
                        yStart = pointList[1][1];
                        yEnd = pointList[0][1];
                        break;
                    case 'end':
                        xStart = pointList[length - 2][0];
                        xEnd = pointList[length - 1][0];
                        yStart = pointList[length - 2][1];
                        yEnd = pointList[length - 1][1];
                        break;
                }
                tx = xEnd;
                ty = yEnd;
                var angle = Math.atan((yStart - yEnd) / (xEnd - xStart)) / Math.PI * 180;
                if (xEnd - xStart < 0) {
                    angle += 180;
                } else if (yStart - yEnd < 0) {
                    angle += 360;
                }
                dd = 5;
                if (angle >= 30 && angle <= 150) {
                    al = 'center';
                    bl = 'bottom';
                    ty -= dd;
                } else if (angle > 150 && angle < 210) {
                    al = 'right';
                    bl = 'middle';
                    tx -= dd;
                } else if (angle >= 210 && angle <= 330) {
                    al = 'center';
                    bl = 'top';
                    ty += dd;
                } else {
                    al = 'left';
                    bl = 'middle';
                    tx += dd;
                }
                break;
            case 'specific':
                tx = style.textX || 0;
                ty = style.textY || 0;
                al = 'start';
                bl = 'middle';
                break;
        }

        if (tx != null && ty != null) {
            /*
             用于多色显示连线文字
             added by myyao on 17.05.24
             */
            if (thisIndex != undefined && otherText != undefined) {
                var _halfSpaceWidth = zrArea.getTextWidth(otherText, style.textFont) / 2;
                tx += thisIndex ? _halfSpaceWidth : -_halfSpaceWidth;
                // var _spaceLength = (otherText + '').length,
                //     _spaceTxt = new Array(_spaceLength += ((_spaceLength < 4) ? 1 : 6)).join(' '); //TODO myyao 占位空格长度待调优
                // style.text = thisIndex ? _spaceTxt + style.text : style.text + _spaceTxt;
            }
            // 根节点文字添加边框
            // if (style.isRoot) {
            //     var textWidth = zrArea.getTextWidth(style.text, style.textFont);
            //     ctx.save();
            //     ctx.strokeStyle="#FF8C61";
            //     ctx.strokeRect(tx - textWidth / 2 - 2, ty, textWidth + 4, 14);
            //     ctx.restore();
            // }
            // 添加结束
            _fillText(ctx, style.text, tx, ty, style.textFont, style.textAlign || al, style.textBaseline || bl);
        }
    };
    Base.prototype.modSelf = function () {
        this.__dirty = true;
        if (this.style) {
            this.style.__rect = null;
        }
        if (this.highlightStyle) {
            this.highlightStyle.__rect = null;
        }
    };
    Base.prototype.isSilent = function () {
        return !(this.hoverable || this.draggable || this.clickable || this.onmousemove || this.onmouseover || this.onmouseout || this.onmousedown || this.onmouseup || this.onclick || this.ondragenter || this.ondragover || this.ondragleave || this.ondrop);
    };
    util.merge(Base.prototype, Transformable.prototype, true);
    util.merge(Base.prototype, Eventful.prototype, true);
    return Base;
});define('zrender/tool/curve', [
    'require',
    './vector'
], function (require) {
    var vector = require('./vector');
    'use strict';
    var EPSILON = 0.0001;
    var THREE_SQRT = Math.sqrt(3);
    var ONE_THIRD = 1 / 3;
    var _v0 = vector.create();
    var _v1 = vector.create();
    var _v2 = vector.create();
    function isAroundZero(val) {
        return val > -EPSILON && val < EPSILON;
    }
    function isNotAroundZero(val) {
        return val > EPSILON || val < -EPSILON;
    }
    function cubicAt(p0, p1, p2, p3, t) {
        var onet = 1 - t;
        return onet * onet * (onet * p0 + 3 * t * p1) + t * t * (t * p3 + 3 * onet * p2);
    }
    function cubicDerivativeAt(p0, p1, p2, p3, t) {
        var onet = 1 - t;
        return 3 * (((p1 - p0) * onet + 2 * (p2 - p1) * t) * onet + (p3 - p2) * t * t);
    }
    function cubicRootAt(p0, p1, p2, p3, val, roots) {
        var a = p3 + 3 * (p1 - p2) - p0;
        var b = 3 * (p2 - p1 * 2 + p0);
        var c = 3 * (p1 - p0);
        var d = p0 - val;
        var A = b * b - 3 * a * c;
        var B = b * c - 9 * a * d;
        var C = c * c - 3 * b * d;
        var n = 0;
        if (isAroundZero(A) && isAroundZero(B)) {
            if (isAroundZero(b)) {
                roots[0] = 0;
            } else {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            }
        } else {
            var disc = B * B - 4 * A * C;
            if (isAroundZero(disc)) {
                var K = B / A;
                var t1 = -b / a + K;
                var t2 = -K / 2;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var Y1 = A * b + 1.5 * a * (-B + discSqrt);
                var Y2 = A * b + 1.5 * a * (-B - discSqrt);
                if (Y1 < 0) {
                    Y1 = -Math.pow(-Y1, ONE_THIRD);
                } else {
                    Y1 = Math.pow(Y1, ONE_THIRD);
                }
                if (Y2 < 0) {
                    Y2 = -Math.pow(-Y2, ONE_THIRD);
                } else {
                    Y2 = Math.pow(Y2, ONE_THIRD);
                }
                var t1 = (-b - (Y1 + Y2)) / (3 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            } else {
                var T = (2 * A * b - 3 * a * B) / (2 * Math.sqrt(A * A * A));
                var theta = Math.acos(T) / 3;
                var ASqrt = Math.sqrt(A);
                var tmp = Math.cos(theta);
                var t1 = (-b - 2 * ASqrt * tmp) / (3 * a);
                var t2 = (-b + ASqrt * (tmp + THREE_SQRT * Math.sin(theta))) / (3 * a);
                var t3 = (-b + ASqrt * (tmp - THREE_SQRT * Math.sin(theta))) / (3 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
                if (t3 >= 0 && t3 <= 1) {
                    roots[n++] = t3;
                }
            }
        }
        return n;
    }
    function cubicExtrema(p0, p1, p2, p3, extrema) {
        var b = 6 * p2 - 12 * p1 + 6 * p0;
        var a = 9 * p1 + 3 * p3 - 3 * p0 - 9 * p2;
        var c = 3 * p1 - 3 * p0;
        var n = 0;
        if (isAroundZero(a)) {
            if (isNotAroundZero(b)) {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    extrema[n++] = t1;
                }
            }
        } else {
            var disc = b * b - 4 * a * c;
            if (isAroundZero(disc)) {
                extrema[0] = -b / (2 * a);
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var t1 = (-b + discSqrt) / (2 * a);
                var t2 = (-b - discSqrt) / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    extrema[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    extrema[n++] = t2;
                }
            }
        }
        return n;
    }
    function cubicSubdivide(p0, p1, p2, p3, t, out) {
        var p01 = (p1 - p0) * t + p0;
        var p12 = (p2 - p1) * t + p1;
        var p23 = (p3 - p2) * t + p2;
        var p012 = (p12 - p01) * t + p01;
        var p123 = (p23 - p12) * t + p12;
        var p0123 = (p123 - p012) * t + p012;
        out[0] = p0;
        out[1] = p01;
        out[2] = p012;
        out[3] = p0123;
        out[4] = p0123;
        out[5] = p123;
        out[6] = p23;
        out[7] = p3;
    }
    function cubicProjectPoint(x0, y0, x1, y1, x2, y2, x3, y3, x, y, out) {
        var t;
        var interval = 0.005;
        var d = Infinity;
        _v0[0] = x;
        _v0[1] = y;
        for (var _t = 0; _t < 1; _t += 0.05) {
            _v1[0] = cubicAt(x0, x1, x2, x3, _t);
            _v1[1] = cubicAt(y0, y1, y2, y3, _t);
            var d1 = vector.distSquare(_v0, _v1);
            if (d1 < d) {
                t = _t;
                d = d1;
            }
        }
        d = Infinity;
        for (var i = 0; i < 32; i++) {
            if (interval < EPSILON) {
                break;
            }
            var prev = t - interval;
            var next = t + interval;
            _v1[0] = cubicAt(x0, x1, x2, x3, prev);
            _v1[1] = cubicAt(y0, y1, y2, y3, prev);
            var d1 = vector.distSquare(_v1, _v0);
            if (prev >= 0 && d1 < d) {
                t = prev;
                d = d1;
            } else {
                _v2[0] = cubicAt(x0, x1, x2, x3, next);
                _v2[1] = cubicAt(y0, y1, y2, y3, next);
                var d2 = vector.distSquare(_v2, _v0);
                if (next <= 1 && d2 < d) {
                    t = next;
                    d = d2;
                } else {
                    interval *= 0.5;
                }
            }
        }
        if (out) {
            out[0] = cubicAt(x0, x1, x2, x3, t);
            out[1] = cubicAt(y0, y1, y2, y3, t);
        }
        return Math.sqrt(d);
    }
    function quadraticAt(p0, p1, p2, t) {
        var onet = 1 - t;
        return onet * (onet * p0 + 2 * t * p1) + t * t * p2;
    }
    function quadraticDerivativeAt(p0, p1, p2, t) {
        return 2 * ((1 - t) * (p1 - p0) + t * (p2 - p1));
    }
    function quadraticRootAt(p0, p1, p2, val, roots) {
        var a = p0 - 2 * p1 + p2;
        var b = 2 * (p1 - p0);
        var c = p0 - val;
        var n = 0;
        if (isAroundZero(a)) {
            if (isNotAroundZero(b)) {
                var t1 = -c / b;
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            }
        } else {
            var disc = b * b - 4 * a * c;
            if (isAroundZero(disc)) {
                var t1 = -b / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
            } else if (disc > 0) {
                var discSqrt = Math.sqrt(disc);
                var t1 = (-b + discSqrt) / (2 * a);
                var t2 = (-b - discSqrt) / (2 * a);
                if (t1 >= 0 && t1 <= 1) {
                    roots[n++] = t1;
                }
                if (t2 >= 0 && t2 <= 1) {
                    roots[n++] = t2;
                }
            }
        }
        return n;
    }
    function quadraticExtremum(p0, p1, p2) {
        var divider = p0 + p2 - 2 * p1;
        if (divider === 0) {
            return 0.5;
        } else {
            return (p0 - p1) / divider;
        }
    }
    function quadraticSubdivide(p0, p1, p2, t, out) {
        var p01 = (p1 - p0) * t + p0;
        var p12 = (p2 - p1) * t + p1;
        var p012 = (p12 - p01) * t + p01;
        out[0] = p0;
        out[1] = p01;
        out[2] = p012;
        out[3] = p012;
        out[4] = p12;
        out[5] = p2;
    }
    function quadraticProjectPoint(x0, y0, x1, y1, x2, y2, x, y, out) {
        var t;
        var interval = 0.005;
        var d = Infinity;
        _v0[0] = x;
        _v0[1] = y;
        for (var _t = 0; _t < 1; _t += 0.05) {
            _v1[0] = quadraticAt(x0, x1, x2, _t);
            _v1[1] = quadraticAt(y0, y1, y2, _t);
            var d1 = vector.distSquare(_v0, _v1);
            if (d1 < d) {
                t = _t;
                d = d1;
            }
        }
        d = Infinity;
        for (var i = 0; i < 32; i++) {
            if (interval < EPSILON) {
                break;
            }
            var prev = t - interval;
            var next = t + interval;
            _v1[0] = quadraticAt(x0, x1, x2, prev);
            _v1[1] = quadraticAt(y0, y1, y2, prev);
            var d1 = vector.distSquare(_v1, _v0);
            if (prev >= 0 && d1 < d) {
                t = prev;
                d = d1;
            } else {
                _v2[0] = quadraticAt(x0, x1, x2, next);
                _v2[1] = quadraticAt(y0, y1, y2, next);
                var d2 = vector.distSquare(_v2, _v0);
                if (next <= 1 && d2 < d) {
                    t = next;
                    d = d2;
                } else {
                    interval *= 0.5;
                }
            }
        }
        if (out) {
            out[0] = quadraticAt(x0, x1, x2, t);
            out[1] = quadraticAt(y0, y1, y2, t);
        }
        return Math.sqrt(d);
    }
    return {
        cubicAt: cubicAt,
        cubicDerivativeAt: cubicDerivativeAt,
        cubicRootAt: cubicRootAt,
        cubicExtrema: cubicExtrema,
        cubicSubdivide: cubicSubdivide,
        cubicProjectPoint: cubicProjectPoint,
        quadraticAt: quadraticAt,
        quadraticDerivativeAt: quadraticDerivativeAt,
        quadraticRootAt: quadraticRootAt,
        quadraticExtremum: quadraticExtremum,
        quadraticSubdivide: quadraticSubdivide,
        quadraticProjectPoint: quadraticProjectPoint
    };
});define('zrender/mixin/Transformable', [
    'require',
    '../tool/matrix',
    '../tool/vector'
], function (require) {
    'use strict';
    var matrix = require('../tool/matrix');
    var vector = require('../tool/vector');
    var origin = [
        0,
        0
    ];
    var mTranslate = matrix.translate;
    var EPSILON = 0.00005;
    function isAroundZero(val) {
        return val > -EPSILON && val < EPSILON;
    }
    function isNotAroundZero(val) {
        return val > EPSILON || val < -EPSILON;
    }
    var Transformable = function () {
        if (!this.position) {
            this.position = [
                0,
                0
            ];
        }
        if (typeof this.rotation == 'undefined') {
            this.rotation = [
                0,
                0,
                0
            ];
        }
        if (!this.scale) {
            this.scale = [
                1,
                1,
                0,
                0
            ];
        }
        this.needLocalTransform = false;
        this.needTransform = false;
    };
    Transformable.prototype = {
        constructor: Transformable,
        updateNeedTransform: function () {
            this.needLocalTransform = isNotAroundZero(this.rotation[0]) || isNotAroundZero(this.position[0]) || isNotAroundZero(this.position[1]) || isNotAroundZero(this.scale[0] - 1) || isNotAroundZero(this.scale[1] - 1);
        },
        updateTransform: function () {
            this.updateNeedTransform();
            var parentHasTransform = this.parent && this.parent.needTransform;
            this.needTransform = this.needLocalTransform || parentHasTransform;
            if (!this.needTransform) {
                return;
            }
            var m = this.transform || matrix.create();
            matrix.identity(m);
            if (this.needLocalTransform) {
                var scale = this.scale;
                if (isNotAroundZero(scale[0]) || isNotAroundZero(scale[1])) {
                    origin[0] = -scale[2] || 0;
                    origin[1] = -scale[3] || 0;
                    var haveOrigin = isNotAroundZero(origin[0]) || isNotAroundZero(origin[1]);
                    if (haveOrigin) {
                        mTranslate(m, m, origin);
                    }
                    matrix.scale(m, m, scale);
                    if (haveOrigin) {
                        origin[0] = -origin[0];
                        origin[1] = -origin[1];
                        mTranslate(m, m, origin);
                    }
                }
                if (this.rotation instanceof Array) {
                    if (this.rotation[0] !== 0) {
                        origin[0] = -this.rotation[1] || 0;
                        origin[1] = -this.rotation[2] || 0;
                        var haveOrigin = isNotAroundZero(origin[0]) || isNotAroundZero(origin[1]);
                        if (haveOrigin) {
                            mTranslate(m, m, origin);
                        }
                        matrix.rotate(m, m, this.rotation[0]);
                        if (haveOrigin) {
                            origin[0] = -origin[0];
                            origin[1] = -origin[1];
                            mTranslate(m, m, origin);
                        }
                    }
                } else {
                    if (this.rotation !== 0) {
                        matrix.rotate(m, m, this.rotation);
                    }
                }
                if (isNotAroundZero(this.position[0]) || isNotAroundZero(this.position[1])) {
                    mTranslate(m, m, this.position);
                }
            }
            if (parentHasTransform) {
                if (this.needLocalTransform) {
                    matrix.mul(m, this.parent.transform, m);
                } else {
                    matrix.copy(m, this.parent.transform);
                }
            }
            this.transform = m;
            this.invTransform = this.invTransform || matrix.create();
            matrix.invert(this.invTransform, m);
        },
        setTransform: function (ctx) {
            if (this.needTransform) {
                var m = this.transform;
                ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            }
        },
        lookAt: function () {
            var v = vector.create();
            return function (target) {
                if (!this.transform) {
                    this.transform = matrix.create();
                }
                var m = this.transform;
                vector.sub(v, target, this.position);
                if (isAroundZero(v[0]) && isAroundZero(v[1])) {
                    return;
                }
                vector.normalize(v, v);
                var scale = this.scale;
                m[2] = v[0] * scale[1];
                m[3] = v[1] * scale[1];
                m[0] = v[1] * scale[0];
                m[1] = -v[0] * scale[0];
                m[4] = this.position[0];
                m[5] = this.position[1];
                this.decomposeTransform();
            };
        }(),
        decomposeTransform: function () {
            if (!this.transform) {
                return;
            }
            var m = this.transform;
            var sx = m[0] * m[0] + m[1] * m[1];
            var position = this.position;
            var scale = this.scale;
            var rotation = this.rotation;
            if (isNotAroundZero(sx - 1)) {
                sx = Math.sqrt(sx);
            }
            var sy = m[2] * m[2] + m[3] * m[3];
            if (isNotAroundZero(sy - 1)) {
                sy = Math.sqrt(sy);
            }
            position[0] = m[4];
            position[1] = m[5];
            scale[0] = sx;
            scale[1] = sy;
            scale[2] = scale[3] = 0;
            rotation[0] = Math.atan2(-m[1] / sy, m[0] / sx);
            rotation[1] = rotation[2] = 0;
        },
        transformCoordToLocal: function (x, y) {
            var v2 = [
                x,
                y
            ];
            if (this.needTransform && this.invTransform) {
                matrix.mulVector(v2, this.invTransform, v2);
            }
            return v2;
        }
    };
    return Transformable;
});define('zrender/Group', [
    'require',
    './tool/guid',
    './tool/util',
    './mixin/Transformable',
    './mixin/Eventful'
], function (require) {
    var guid = require('./tool/guid');
    var util = require('./tool/util');
    var Transformable = require('./mixin/Transformable');
    var Eventful = require('./mixin/Eventful');
    var Group = function (options) {
        options = options || {};
        this.id = options.id || guid();
        for (var key in options) {
            this[key] = options[key];
        }
        this.type = 'group';
        this.clipShape = null;
        this._children = [];
        this._storage = null;
        this.__dirty = true;
        Transformable.call(this);
        Eventful.call(this);
    };
    Group.prototype.ignore = false;
    Group.prototype.children = function () {
        return this._children.slice();
    };
    Group.prototype.childAt = function (idx) {
        return this._children[idx];
    };
    Group.prototype.addChild = function (child) {
        if (child == this) {
            return;
        }
        if (child.parent == this) {
            return;
        }
        if (child.parent) {
            child.parent.removeChild(child);
        }
        this._children.push(child);
        child.parent = this;
        if (this._storage && this._storage !== child._storage) {
            this._storage.addToMap(child);
            if (child instanceof Group) {
                child.addChildrenToStorage(this._storage);
            }
        }
    };
    Group.prototype.removeChild = function (child) {
        var idx = util.indexOf(this._children, child);
        if (idx >= 0) {
            this._children.splice(idx, 1);
        }
        child.parent = null;
        if (this._storage) {
            this._storage.delFromMap(child.id);
            if (child instanceof Group) {
                child.delChildrenFromStorage(this._storage);
            }
        }
    };
    Group.prototype.clearChildren = function () {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (this._storage) {
                this._storage.delFromMap(child.id);
                if (child instanceof Group) {
                    child.delChildrenFromStorage(this._storage);
                }
            }
        }
        this._children.length = 0;
    };
    Group.prototype.eachChild = function (cb, context) {
        var haveContext = !!context;
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (haveContext) {
                cb.call(context, child);
            } else {
                cb(child);
            }
        }
    };
    Group.prototype.traverse = function (cb, context) {
        var haveContext = !!context;
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            if (haveContext) {
                cb.call(context, child);
            } else {
                cb(child);
            }
            if (child.type === 'group') {
                child.traverse(cb, context);
            }
        }
    };
    Group.prototype.addChildrenToStorage = function (storage) {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            storage.addToMap(child);
            if (child instanceof Group) {
                child.addChildrenToStorage(storage);
            }
        }
    };
    Group.prototype.delChildrenFromStorage = function (storage) {
        for (var i = 0; i < this._children.length; i++) {
            var child = this._children[i];
            storage.delFromMap(child.id);
            if (child instanceof Group) {
                child.delChildrenFromStorage(storage);
            }
        }
    };
    Group.prototype.modSelf = function () {
        this.__dirty = true;
    };
    util.merge(Group.prototype, Transformable.prototype, true);
    util.merge(Group.prototype, Eventful.prototype, true);
    return Group;
});define('zrender/animation/Clip', [
    'require',
    './easing'
], function (require) {
    var Easing = require('./easing');
    function Clip(options) {
        this._targetPool = options.target || {};
        if (!(this._targetPool instanceof Array)) {
            this._targetPool = [this._targetPool];
        }
        this._life = options.life || 1000;
        this._delay = options.delay || 0;
        this._startTime = new Date().getTime() + this._delay;
        this._endTime = this._startTime + this._life * 1000;
        this.loop = typeof options.loop == 'undefined' ? false : options.loop;
        this.gap = options.gap || 0;
        this.easing = options.easing || 'Linear';
        this.onframe = options.onframe;
        this.ondestroy = options.ondestroy;
        this.onrestart = options.onrestart;
    }
    Clip.prototype = {
        step: function (time) {
            var percent = (time - this._startTime) / this._life;
            if (percent < 0) {
                return;
            }
            percent = Math.min(percent, 1);
            var easingFunc = typeof this.easing == 'string' ? Easing[this.easing] : this.easing;
            var schedule = typeof easingFunc === 'function' ? easingFunc(percent) : percent;
            this.fire('frame', schedule);
            if (percent == 1) {
                if (this.loop) {
                    this.restart();
                    return 'restart';
                }
                this._needsRemove = true;
                return 'destroy';
            }
            return null;
        },
        restart: function () {
            var time = new Date().getTime();
            var remainder = (time - this._startTime) % this._life;
            this._startTime = new Date().getTime() - remainder + this.gap;
            this._needsRemove = false;
        },
        fire: function (eventType, arg) {
            for (var i = 0, len = this._targetPool.length; i < len; i++) {
                if (this['on' + eventType]) {
                    this['on' + eventType](this._targetPool[i], arg);
                }
            }
        },
        constructor: Clip
    };
    return Clip;
});define('zrender/animation/easing', [], function () {
    var easing = {
        Linear: function (k) {
            return k;
        },
        QuadraticIn: function (k) {
            return k * k;
        },
        QuadraticOut: function (k) {
            return k * (2 - k);
        },
        QuadraticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k;
            }
            return -0.5 * (--k * (k - 2) - 1);
        },
        CubicIn: function (k) {
            return k * k * k;
        },
        CubicOut: function (k) {
            return --k * k * k + 1;
        },
        CubicInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k;
            }
            return 0.5 * ((k -= 2) * k * k + 2);
        },
        QuarticIn: function (k) {
            return k * k * k * k;
        },
        QuarticOut: function (k) {
            return 1 - --k * k * k * k;
        },
        QuarticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k * k;
            }
            return -0.5 * ((k -= 2) * k * k * k - 2);
        },
        QuinticIn: function (k) {
            return k * k * k * k * k;
        },
        QuinticOut: function (k) {
            return --k * k * k * k * k + 1;
        },
        QuinticInOut: function (k) {
            if ((k *= 2) < 1) {
                return 0.5 * k * k * k * k * k;
            }
            return 0.5 * ((k -= 2) * k * k * k * k + 2);
        },
        SinusoidalIn: function (k) {
            return 1 - Math.cos(k * Math.PI / 2);
        },
        SinusoidalOut: function (k) {
            return Math.sin(k * Math.PI / 2);
        },
        SinusoidalInOut: function (k) {
            return 0.5 * (1 - Math.cos(Math.PI * k));
        },
        ExponentialIn: function (k) {
            return k === 0 ? 0 : Math.pow(1024, k - 1);
        },
        ExponentialOut: function (k) {
            return k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
        },
        ExponentialInOut: function (k) {
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if ((k *= 2) < 1) {
                return 0.5 * Math.pow(1024, k - 1);
            }
            return 0.5 * (-Math.pow(2, -10 * (k - 1)) + 2);
        },
        CircularIn: function (k) {
            return 1 - Math.sqrt(1 - k * k);
        },
        CircularOut: function (k) {
            return Math.sqrt(1 - --k * k);
        },
        CircularInOut: function (k) {
            if ((k *= 2) < 1) {
                return -0.5 * (Math.sqrt(1 - k * k) - 1);
            }
            return 0.5 * (Math.sqrt(1 - (k -= 2) * k) + 1);
        },
        ElasticIn: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            return -(a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
        },
        ElasticOut: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            return a * Math.pow(2, -10 * k) * Math.sin((k - s) * (2 * Math.PI) / p) + 1;
        },
        ElasticInOut: function (k) {
            var s;
            var a = 0.1;
            var p = 0.4;
            if (k === 0) {
                return 0;
            }
            if (k === 1) {
                return 1;
            }
            if (!a || a < 1) {
                a = 1;
                s = p / 4;
            } else {
                s = p * Math.asin(1 / a) / (2 * Math.PI);
            }
            if ((k *= 2) < 1) {
                return -0.5 * (a * Math.pow(2, 10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p));
            }
            return a * Math.pow(2, -10 * (k -= 1)) * Math.sin((k - s) * (2 * Math.PI) / p) * 0.5 + 1;
        },
        BackIn: function (k) {
            var s = 1.70158;
            return k * k * ((s + 1) * k - s);
        },
        BackOut: function (k) {
            var s = 1.70158;
            return --k * k * ((s + 1) * k + s) + 1;
        },
        BackInOut: function (k) {
            var s = 1.70158 * 1.525;
            if ((k *= 2) < 1) {
                return 0.5 * (k * k * ((s + 1) * k - s));
            }
            return 0.5 * ((k -= 2) * k * ((s + 1) * k + s) + 2);
        },
        BounceIn: function (k) {
            return 1 - easing.BounceOut(1 - k);
        },
        BounceOut: function (k) {
            if (k < 1 / 2.75) {
                return 7.5625 * k * k;
            } else if (k < 2 / 2.75) {
                return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
            } else if (k < 2.5 / 2.75) {
                return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
            } else {
                return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
            }
        },
        BounceInOut: function (k) {
            if (k < 0.5) {
                return easing.BounceIn(k * 2) * 0.5;
            }
            return easing.BounceOut(k * 2 - 1) * 0.5 + 0.5;
        }
    };
    return easing;
});define('echarts/chart/base', [
    'require',
    'zrender/shape/Image',
    '../util/shape/Icon',
    '../util/shape/MarkLine',
    '../util/shape/Symbol',
    'zrender/shape/Polyline',
    'zrender/shape/ShapeBundle',
    '../config',
    '../util/ecData',
    '../util/ecAnimation',
    '../util/accMath',
    '../component/base',
    'zrender/tool/util',
    'zrender/tool/area'
], function (require) {
    var ImageShape = require('zrender/shape/Image');
    var IconShape = require('../util/shape/Icon');
    var MarkLineShape = require('../util/shape/MarkLine');
    var SymbolShape = require('../util/shape/Symbol');
    var PolylineShape = require('zrender/shape/Polyline');
    var ShapeBundle = require('zrender/shape/ShapeBundle');
    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var ecAnimation = require('../util/ecAnimation');
    var accMath = require('../util/accMath');
    var ComponentBase = require('../component/base');
    var zrUtil = require('zrender/tool/util');
    var zrArea = require('zrender/tool/area');
    function isCoordAvailable(coord) {
        return coord.x != null && coord.y != null;
    }
    function Base(ecTheme, messageCenter, zr, option, myChart) {
        ComponentBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        var self = this;
        this.selectedMap = {};
        this.lastShapeList = [];
        this.shapeHandler = {
            onclick: function () {
                self.isClick = true;
            },
            ondragover: function (param) {
                var calculableShape = param.target;
                calculableShape.highlightStyle = calculableShape.highlightStyle || {};
                var highlightStyle = calculableShape.highlightStyle;
                var brushType = highlightStyle.brushTyep;
                var strokeColor = highlightStyle.strokeColor;
                var lineWidth = highlightStyle.lineWidth;
                highlightStyle.brushType = 'stroke';
                highlightStyle.strokeColor = self.ecTheme.calculableColor || ecConfig.calculableColor;
                highlightStyle.lineWidth = calculableShape.type === 'icon' ? 30 : 10;
                self.zr.addHoverShape(calculableShape);
                setTimeout(function () {
                    if (highlightStyle) {
                        highlightStyle.brushType = brushType;
                        highlightStyle.strokeColor = strokeColor;
                        highlightStyle.lineWidth = lineWidth;
                    }
                }, 20);
            },
            ondrop: function (param) {
                if (ecData.get(param.dragged, 'data') != null) {
                    self.isDrop = true;
                }
            },
            ondragend: function () {
                self.isDragend = true;
            }
        };
    }
    Base.prototype = {
        setCalculable: function (shape) {
            shape.dragEnableTime = this.ecTheme.DRAG_ENABLE_TIME || ecConfig.DRAG_ENABLE_TIME;
            shape.ondragover = this.shapeHandler.ondragover;
            shape.ondragend = this.shapeHandler.ondragend;
            shape.ondrop = this.shapeHandler.ondrop;
            return shape;
        },
        ondrop: function (param, status) {
            if (!this.isDrop || !param.target || status.dragIn) {
                return;
            }
            var target = param.target;
            var dragged = param.dragged;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            var series = this.series;
            var data;
            var legend = this.component.legend;
            if (dataIndex === -1) {
                if (ecData.get(dragged, 'seriesIndex') == seriesIndex) {
                    status.dragOut = status.dragIn = status.needRefresh = true;
                    this.isDrop = false;
                    return;
                }
                data = {
                    value: ecData.get(dragged, 'value'),
                    name: ecData.get(dragged, 'name')
                };
                if (this.type === ecConfig.CHART_TYPE_PIE && data.value < 0) {
                    data.value = 0;
                }
                var hasFind = false;
                var sData = series[seriesIndex].data;
                for (var i = 0, l = sData.length; i < l; i++) {
                    if (sData[i].name === data.name && sData[i].value === '-') {
                        series[seriesIndex].data[i].value = data.value;
                        hasFind = true;
                    }
                }
                !hasFind && series[seriesIndex].data.push(data);
                legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
            } else {
                data = series[seriesIndex].data[dataIndex] || '-';
                if (data.value != null) {
                    if (data.value != '-') {
                        series[seriesIndex].data[dataIndex].value = accMath.accAdd(series[seriesIndex].data[dataIndex].value, ecData.get(dragged, 'value'));
                    } else {
                        series[seriesIndex].data[dataIndex].value = ecData.get(dragged, 'value');
                    }
                    if (this.type === ecConfig.CHART_TYPE_FUNNEL || this.type === ecConfig.CHART_TYPE_PIE) {
                        legend && legend.getRelatedAmount(data.name) === 1 && this.component.legend.del(data.name);
                        data.name += this.option.nameConnector + ecData.get(dragged, 'name');
                        legend && legend.add(data.name, dragged.style.color || dragged.style.strokeColor);
                    }
                } else {
                    if (data != '-') {
                        series[seriesIndex].data[dataIndex] = accMath.accAdd(series[seriesIndex].data[dataIndex], ecData.get(dragged, 'value'));
                    } else {
                        series[seriesIndex].data[dataIndex] = ecData.get(dragged, 'value');
                    }
                }
            }
            status.dragIn = status.dragIn || true;
            this.isDrop = false;
            var self = this;
            setTimeout(function () {
                self.zr.trigger('mousemove', param.event);
            }, 300);
            return;
        },
        ondragend: function (param, status) {
            if (!this.isDragend || !param.target || status.dragOut) {
                return;
            }
            var target = param.target;
            var seriesIndex = ecData.get(target, 'seriesIndex');
            var dataIndex = ecData.get(target, 'dataIndex');
            var series = this.series;
            if (series[seriesIndex].data[dataIndex].value != null) {
                series[seriesIndex].data[dataIndex].value = '-';
                var name = series[seriesIndex].data[dataIndex].name;
                var legend = this.component.legend;
                if (legend && legend.getRelatedAmount(name) === 0) {
                    legend.del(name);
                }
            } else {
                series[seriesIndex].data[dataIndex] = '-';
            }
            status.dragOut = true;
            status.needRefresh = true;
            this.isDragend = false;
            return;
        },
        onlegendSelected: function (param, status) {
            var legendSelected = param.selected;
            for (var itemName in this.selectedMap) {
                if (this.selectedMap[itemName] != legendSelected[itemName]) {
                    status.needRefresh = true;
                }
                this.selectedMap[itemName] = legendSelected[itemName];
            }
            return;
        },
        _buildPosition: function () {
            this._symbol = this.option.symbolList;
            this._sIndex2ShapeMap = {};
            this._sIndex2ColorMap = {};
            this.selectedMap = {};
            this.xMarkMap = {};
            var series = this.series;
            var _position2sIndexMap = {
                top: [],
                bottom: [],
                left: [],
                right: [],
                other: []
            };
            var xAxisIndex;
            var yAxisIndex;
            var xAxis;
            var yAxis;
            for (var i = 0, l = series.length; i < l; i++) {
                if (series[i].type === this.type) {
                    series[i] = this.reformOption(series[i]);
                    this.legendHoverLink = series[i].legendHoverLink || this.legendHoverLink;
                    xAxisIndex = series[i].xAxisIndex;
                    yAxisIndex = series[i].yAxisIndex;
                    xAxis = this.component.xAxis.getAxis(xAxisIndex);
                    yAxis = this.component.yAxis.getAxis(yAxisIndex);
                    if (xAxis.type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        _position2sIndexMap[xAxis.getPosition()].push(i);
                    } else if (yAxis.type === ecConfig.COMPONENT_TYPE_AXIS_CATEGORY) {
                        _position2sIndexMap[yAxis.getPosition()].push(i);
                    } else {
                        _position2sIndexMap.other.push(i);
                    }
                }
            }
            for (var position in _position2sIndexMap) {
                if (_position2sIndexMap[position].length > 0) {
                    this._buildSinglePosition(position, _position2sIndexMap[position]);
                }
            }
            this.addShapeList();
        },
        _buildSinglePosition: function (position, seriesArray) {
            var mapData = this._mapData(seriesArray);
            var locationMap = mapData.locationMap;
            var maxDataLength = mapData.maxDataLength;
            if (maxDataLength === 0 || locationMap.length === 0) {
                return;
            }
            switch (position) {
                case 'bottom':
                case 'top':
                    this._buildHorizontal(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                    break;
                case 'left':
                case 'right':
                    this._buildVertical(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                    break;
                case 'other':
                    this._buildOther(seriesArray, maxDataLength, locationMap, this.xMarkMap);
                    break;
            }
        },
        _mapData: function (seriesArray) {
            var series = this.series;
            var serie;
            var dataIndex = 0;
            var stackMap = {};
            var magicStackKey = '__kener__stack__';
            var stackKey;
            var serieName;
            var legend = this.component.legend;
            var locationMap = [];
            var maxDataLength = 0;
            var iconShape;
            for (var i = 0, l = seriesArray.length; i < l; i++) {
                serie = series[seriesArray[i]];
                serieName = serie.name;
                this._sIndex2ShapeMap[seriesArray[i]] = this._sIndex2ShapeMap[seriesArray[i]] || this.query(serie, 'symbol') || this._symbol[i % this._symbol.length];
                if (legend) {
                    this.selectedMap[serieName] = legend.isSelected(serieName);
                    this._sIndex2ColorMap[seriesArray[i]] = legend.getColor(serieName);
                    iconShape = legend.getItemShape(serieName);
                    if (iconShape) {
                        var style = iconShape.style;
                        if (this.type == ecConfig.CHART_TYPE_LINE) {
                            style.iconType = 'legendLineIcon';
                            style.symbol = this._sIndex2ShapeMap[seriesArray[i]];
                        } else if (serie.itemStyle.normal.barBorderWidth > 0) {
                            var highlightStyle = iconShape.highlightStyle;
                            style.brushType = 'both';
                            style.x += 1;
                            style.y += 1;
                            style.width -= 2;
                            style.height -= 2;
                            style.strokeColor = highlightStyle.strokeColor = serie.itemStyle.normal.barBorderColor;
                            highlightStyle.lineWidth = 3;
                        }
                        legend.setItemShape(serieName, iconShape);
                    }
                } else {
                    this.selectedMap[serieName] = true;
                    this._sIndex2ColorMap[seriesArray[i]] = this.zr.getColor(seriesArray[i]);
                }
                if (this.selectedMap[serieName]) {
                    stackKey = serie.stack || magicStackKey + seriesArray[i];
                    if (stackMap[stackKey] == null) {
                        stackMap[stackKey] = dataIndex;
                        locationMap[dataIndex] = [seriesArray[i]];
                        dataIndex++;
                    } else {
                        locationMap[stackMap[stackKey]].push(seriesArray[i]);
                    }
                }
                maxDataLength = Math.max(maxDataLength, serie.data.length);
            }
            return {
                locationMap: locationMap,
                maxDataLength: maxDataLength
            };
        },
        addLabel: function (tarShape, serie, data, name, orient) {
            var queryTarget = [
                data,
                serie
            ];
            var nLabel = this.deepMerge(queryTarget, 'itemStyle.normal.label');
            var eLabel = this.deepMerge(queryTarget, 'itemStyle.emphasis.label');
            var nTextStyle = nLabel.textStyle || {};
            var eTextStyle = eLabel.textStyle || {};
            if (nLabel.show) {
                var style = tarShape.style;
                style.text = this._getLabelText(serie, data, name, 'normal');
                style.textPosition = nLabel.position == null ? orient === 'horizontal' ? 'right' : 'top' : nLabel.position;
                style.textColor = nTextStyle.color;
                style.textFont = this.getFont(nTextStyle);
                style.textAlign = nTextStyle.align;
                style.textBaseline = nTextStyle.baseline;
            }
            if (eLabel.show) {
                var highlightStyle = tarShape.highlightStyle;
                highlightStyle.text = this._getLabelText(serie, data, name, 'emphasis');
                highlightStyle.textPosition = nLabel.show ? tarShape.style.textPosition : eLabel.position == null ? orient === 'horizontal' ? 'right' : 'top' : eLabel.position;
                highlightStyle.textColor = eTextStyle.color;
                highlightStyle.textFont = this.getFont(eTextStyle);
                highlightStyle.textAlign = eTextStyle.align;
                highlightStyle.textBaseline = eTextStyle.baseline;
            }
            return tarShape;
        },
        _getLabelText: function (serie, data, name, status) {
            var formatter = this.deepQuery([
                data,
                serie
            ], 'itemStyle.' + status + '.label.formatter');
            if (!formatter && status === 'emphasis') {
                formatter = this.deepQuery([
                    data,
                    serie
                ], 'itemStyle.normal.label.formatter');
            }
            var value = this.getDataFromOption(data, '-');
            if (formatter) {
                if (typeof formatter === 'function') {
                    return formatter.call(this.myChart, {
                        seriesName: serie.name,
                        series: serie,
                        name: name,
                        value: value,
                        data: data,
                        status: status
                    });
                } else if (typeof formatter === 'string') {
                    formatter = formatter.replace('{a}', '{a0}').replace('{b}', '{b0}').replace('{c}', '{c0}').replace('{a0}', serie.name).replace('{b0}', name).replace('{c0}', this.numAddCommas(value));
                    return formatter;
                }
            } else {
                if (value instanceof Array) {
                    return value[2] != null ? this.numAddCommas(value[2]) : value[0] + ' , ' + value[1];
                } else {
                    return this.numAddCommas(value);
                }
            }
        },
        getSymbolShape: function (serie, seriesIndex, data, dataIndex, name, x, y, symbol, color, emptyColor, orient) {
            var queryTarget = [
                data,
                serie
            ];
            var value = this.getDataFromOption(data, '-');
            symbol = this.deepQuery(queryTarget, 'symbol') || symbol;
            var symbolSize = this.deepQuery(queryTarget, 'symbolSize');
            symbolSize = typeof symbolSize === 'function' ? symbolSize(value) : symbolSize;
            if (typeof symbolSize === 'number') {
                symbolSize = [
                    symbolSize,
                    symbolSize
                ];
            }
            var symbolRotate = this.deepQuery(queryTarget, 'symbolRotate');
            var normal = this.deepMerge(queryTarget, 'itemStyle.normal');
            var emphasis = this.deepMerge(queryTarget, 'itemStyle.emphasis');
            var nBorderWidth = normal.borderWidth != null ? normal.borderWidth : normal.lineStyle && normal.lineStyle.width;
            if (nBorderWidth == null) {
                nBorderWidth = symbol.match('empty') ? 2 : 0;
            }
            var eBorderWidth = emphasis.borderWidth != null ? emphasis.borderWidth : emphasis.lineStyle && emphasis.lineStyle.width;
            if (eBorderWidth == null) {
                eBorderWidth = nBorderWidth + 2;
            }
            var nColor = this.getItemStyleColor(normal.color, seriesIndex, dataIndex, data);
            var eColor = this.getItemStyleColor(emphasis.color, seriesIndex, dataIndex, data);
            var width = symbolSize[0];
            var height = symbolSize[1];
            var itemShape = new IconShape({
                style: {
                    iconType: symbol.replace('empty', '').toLowerCase(),
                    x: x - width,
                    y: y - height,
                    width: width * 2,
                    height: height * 2,
                    brushType: 'both',
                    color: symbol.match('empty') ? emptyColor : nColor || color,
                    strokeColor: normal.borderColor || nColor || color,
                    lineWidth: nBorderWidth
                },
                highlightStyle: {
                    color: symbol.match('empty') ? emptyColor : eColor || nColor || color,
                    strokeColor: emphasis.borderColor || normal.borderColor || eColor || nColor || color,
                    lineWidth: eBorderWidth
                },
                clickable: this.deepQuery(queryTarget, 'clickable')
            });
            if (symbol.match('image')) {
                itemShape.style.image = symbol.replace(new RegExp('^image:\\/\\/'), '');
                itemShape = new ImageShape({
                    style: itemShape.style,
                    highlightStyle: itemShape.highlightStyle,
                    clickable: this.deepQuery(queryTarget, 'clickable')
                });
            }
            if (symbolRotate != null) {
                itemShape.rotation = [
                    symbolRotate * Math.PI / 180,
                    x,
                    y
                ];
            }
            if (symbol.match('star')) {
                itemShape.style.iconType = 'star';
                itemShape.style.n = symbol.replace('empty', '').replace('star', '') - 0 || 5;
            }
            if (symbol === 'none') {
                itemShape.invisible = true;
                itemShape.hoverable = false;
            }
            itemShape = this.addLabel(itemShape, serie, data, name, orient);
            if (symbol.match('empty')) {
                if (itemShape.style.textColor == null) {
                    itemShape.style.textColor = itemShape.style.strokeColor;
                }
                if (itemShape.highlightStyle.textColor == null) {
                    itemShape.highlightStyle.textColor = itemShape.highlightStyle.strokeColor;
                }
            }
            ecData.pack(itemShape, serie, seriesIndex, data, dataIndex, name);
            itemShape._x = x;
            itemShape._y = y;
            itemShape._dataIndex = dataIndex;
            itemShape._seriesIndex = seriesIndex;
            return itemShape;
        },
        backupShapeList: function () {
            if (this.shapeList && this.shapeList.length > 0) {
                this.lastShapeList = this.shapeList;
                this.shapeList = [];
            } else {
                this.lastShapeList = [];
            }
        },
        addShapeList: function () {
            var maxLenth = this.option.animationThreshold / (this.canvasSupported ? 2 : 4);
            var lastShapeList = this.lastShapeList;
            var shapeList = this.shapeList;
            var isUpdate = lastShapeList.length > 0;
            var duration = isUpdate ? this.query(this.option, 'animationDurationUpdate') : this.query(this.option, 'animationDuration');
            var easing = this.query(this.option, 'animationEasing');
            var delay;
            var key;
            var oldMap = {};
            var newMap = {};
            if (this.option.animation && !this.option.renderAsImage && shapeList.length < maxLenth && !this.motionlessOnce) {
                for (var i = 0, l = lastShapeList.length; i < l; i++) {
                    key = this._getAnimationKey(lastShapeList[i]);
                    if (key.match('undefined')) {
                        this.zr.delShape(lastShapeList[i].id);
                    } else {
                        key += lastShapeList[i].type;
                        if (oldMap[key]) {
                            this.zr.delShape(lastShapeList[i].id);
                        } else {
                            oldMap[key] = lastShapeList[i];
                        }
                    }
                }
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    key = this._getAnimationKey(shapeList[i]);
                    if (key.match('undefined')) {
                        this.zr.addShape(shapeList[i]);
                    } else {
                        key += shapeList[i].type;
                        newMap[key] = shapeList[i];
                    }
                }
                for (key in oldMap) {
                    if (!newMap[key]) {
                        this.zr.delShape(oldMap[key].id);
                    }
                }
                for (key in newMap) {
                    if (oldMap[key]) {
                        this.zr.delShape(oldMap[key].id);
                        this._animateMod(oldMap[key], newMap[key], duration, easing, 0, isUpdate);
                    } else {
                        delay = (this.type == ecConfig.CHART_TYPE_LINE || this.type == ecConfig.CHART_TYPE_RADAR) && key.indexOf('icon') !== 0 ? duration / 2 : 0;
                        this._animateMod(false, newMap[key], duration, easing, delay, isUpdate);
                    }
                }
                this.zr.refresh();
            } else {
                this.motionlessOnce = false;
                this.zr.delShape(lastShapeList);
                for (var i = 0, l = shapeList.length; i < l; i++) {
                    this.zr.addShape(shapeList[i]);
                }
            }
        },
        _getAnimationKey: function (shape) {
            if (this.type != ecConfig.CHART_TYPE_MAP && this.type != ecConfig.CHART_TYPE_TREEMAP && this.type != ecConfig.CHART_TYPE_VENN) {
                return ecData.get(shape, 'seriesIndex') + '_' + ecData.get(shape, 'dataIndex') + (shape._mark ? shape._mark : '') + (this.type === ecConfig.CHART_TYPE_RADAR ? ecData.get(shape, 'special') : '');
            } else {
                return ecData.get(shape, 'seriesIndex') + '_' + ecData.get(shape, 'dataIndex') + (shape._mark ? shape._mark : 'undefined');
            }
        },
        _animateMod: function (oldShape, newShape, duration, easing, delay, isUpdate) {
            switch (newShape.type) {
                case 'polyline':
                case 'half-smooth-polygon':
                    ecAnimation.pointList(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'rectangle':
                    ecAnimation.rectangle(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'image':
                case 'icon':
                    ecAnimation.icon(this.zr, oldShape, newShape, duration, easing, delay);
                    break;
                case 'candle':
                    if (!isUpdate) {
                        ecAnimation.candle(this.zr, oldShape, newShape, duration, easing);
                    } else {
                        this.zr.addShape(newShape);
                    }
                    break;
                case 'ring':
                case 'sector':
                case 'circle':
                    if (!isUpdate) {
                        ecAnimation.ring(this.zr, oldShape, newShape, duration + (ecData.get(newShape, 'dataIndex') || 0) % 20 * 100, easing);
                    } else if (newShape.type === 'sector') {
                        ecAnimation.sector(this.zr, oldShape, newShape, duration, easing);
                    } else {
                        this.zr.addShape(newShape);
                    }
                    break;
                case 'text':
                    ecAnimation.text(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'polygon':
                    if (!isUpdate) {
                        ecAnimation.polygon(this.zr, oldShape, newShape, duration, easing);
                    } else {
                        ecAnimation.pointList(this.zr, oldShape, newShape, duration, easing);
                    }
                    break;
                case 'ribbon':
                    ecAnimation.ribbon(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'gauge-pointer':
                    ecAnimation.gaugePointer(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'mark-line':
                    ecAnimation.markline(this.zr, oldShape, newShape, duration, easing);
                    break;
                case 'bezier-curve':
                case 'line':
                    ecAnimation.line(this.zr, oldShape, newShape, duration, easing);
                    break;
                default:
                    this.zr.addShape(newShape);
                    break;
            }
        },
        clearEffectShape: function (clearMotionBlur) {
            var effectList = this.effectList;
            if (this.zr && effectList && effectList.length > 0) {
                clearMotionBlur && this.zr.modLayer(ecConfig.EFFECT_ZLEVEL, { motionBlur: false });
                this.zr.delShape(effectList);
                for (var i = 0; i < effectList.length; i++) {
                    if (effectList[i].effectAnimator) {
                        effectList[i].effectAnimator.stop();
                    }
                }
            }
            this.effectList = [];
        }
    };
    zrUtil.inherits(Base, ComponentBase);
    return Base;
});define('zrender/shape/Circle', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var Circle = function (options) {
        Base.call(this, options);
    };
    Circle.prototype = {
        type: 'circle',
        buildPath: function (ctx, style) {
            ctx.moveTo(style.x + style.r, style.y);
            ctx.arc(style.x, style.y, style.r, 0, Math.PI * 2, true);
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - style.r - lineWidth / 2),
                y: Math.round(style.y - style.r - lineWidth / 2),
                width: style.r * 2 + lineWidth,
                height: style.r * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Circle, Base);
    return Circle;
});define('echarts/util/accMath', [], function () {
    function accDiv(arg1, arg2) {
        var s1 = arg1.toString();
        var s2 = arg2.toString();
        var m = 0;
        try {
            m = s2.split('.')[1].length;
        } catch (e) {
        }
        try {
            m -= s1.split('.')[1].length;
        } catch (e) {
        }
        return (s1.replace('.', '') - 0) / (s2.replace('.', '') - 0) * Math.pow(10, m);
    }
    function accMul(arg1, arg2) {
        var s1 = arg1.toString();
        var s2 = arg2.toString();
        var m = 0;
        try {
            m += s1.split('.')[1].length;
        } catch (e) {
        }
        try {
            m += s2.split('.')[1].length;
        } catch (e) {
        }
        return (s1.replace('.', '') - 0) * (s2.replace('.', '') - 0) / Math.pow(10, m);
    }
    function accAdd(arg1, arg2) {
        var r1 = 0;
        var r2 = 0;
        try {
            r1 = arg1.toString().split('.')[1].length;
        } catch (e) {
        }
        try {
            r2 = arg2.toString().split('.')[1].length;
        } catch (e) {
        }
        var m = Math.pow(10, Math.max(r1, r2));
        return (Math.round(arg1 * m) + Math.round(arg2 * m)) / m;
    }
    function accSub(arg1, arg2) {
        return accAdd(arg1, -arg2);
    }
    return {
        accDiv: accDiv,
        accMul: accMul,
        accAdd: accAdd,
        accSub: accSub
    };
});define('echarts/util/shape/Icon', [
    'require',
    'zrender/tool/util',
    'zrender/shape/Droplet',
    'zrender/shape/Image',
    'zrender/shape/Base'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    function _iconMark(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y + style.height);
        ctx.lineTo(x + 5 * dx, y + 14 * dy);
        ctx.lineTo(x + style.width, y + 3 * dy);
        ctx.lineTo(x + 13 * dx, y);
        ctx.lineTo(x + 2 * dx, y + 11 * dy);
        ctx.lineTo(x, y + style.height);
        ctx.moveTo(x + 6 * dx, y + 10 * dy);
        ctx.lineTo(x + 14 * dx, y + 2 * dy);
        ctx.moveTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + style.width, y + 13 * dy);
        ctx.moveTo(x + 13 * dx, y + 10 * dy);
        ctx.lineTo(x + 13 * dx, y + style.height);
    }
    function _iconMarkUndo(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y + style.height);
        ctx.lineTo(x + 5 * dx, y + 14 * dy);
        ctx.lineTo(x + style.width, y + 3 * dy);
        ctx.lineTo(x + 13 * dx, y);
        ctx.lineTo(x + 2 * dx, y + 11 * dy);
        ctx.lineTo(x, y + style.height);
        ctx.moveTo(x + 6 * dx, y + 10 * dy);
        ctx.lineTo(x + 14 * dx, y + 2 * dy);
        ctx.moveTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + style.width, y + 13 * dy);
    }
    function _iconRestore(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        var r = style.width / 2;
        ctx.lineWidth = 1.5;
        ctx.arc(x + r, y + r, r - dx, 0, Math.PI * 2 / 3);
        ctx.moveTo(x + 3 * dx, y + style.height);
        ctx.lineTo(x + 0 * dx, y + 12 * dy);
        ctx.lineTo(x + 5 * dx, y + 11 * dy);
        ctx.moveTo(x, y + 8 * dy);
        ctx.arc(x + r, y + r, r - dx, Math.PI, Math.PI * 5 / 3);
        ctx.moveTo(x + 13 * dx, y);
        ctx.lineTo(x + style.width, y + 4 * dy);
        ctx.lineTo(x + 11 * dx, y + 5 * dy);
    }
    function _iconSave(ctx, style) {
        var x = style.x;
        var y = style.y;
        var dx = style.width / 16;
        var dy = style.height / 16;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + style.height);
        ctx.lineTo(x + style.width, y + style.height);
        ctx.lineTo(x + style.width, y);
        ctx.lineTo(x, y);
        ctx.moveTo(x + 4 * dx, y);
        ctx.lineTo(x + 4 * dx, y + 8 * dy);
        ctx.lineTo(x + 12 * dx, y + 8 * dy);
        ctx.lineTo(x + 12 * dx, y);
        ctx.moveTo(x + 6 * dx, y + 11 * dy);
        ctx.lineTo(x + 6 * dx, y + 13 * dy);
        ctx.lineTo(x + 10 * dx, y + 13 * dy);
        ctx.lineTo(x + 10 * dx, y + 11 * dy);
        ctx.lineTo(x + 6 * dx, y + 11 * dy);
    }
    function _iconCross(ctx, style) {
        var x = style.x;
        var y = style.y;
        var width = style.width;
        var height = style.height;
        ctx.moveTo(x, y + height / 2);
        ctx.lineTo(x + width, y + height / 2);
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width / 2, y + height);
    }
    function _iconCircle(ctx, style) {
        var width = style.width / 2;
        var height = style.height / 2;
        var r = Math.min(width, height);
        ctx.moveTo(style.x + width + r, style.y + height);
        ctx.arc(style.x + width, style.y + height, r, 0, Math.PI * 2);
        ctx.closePath();
    }
    function _iconRectangle(ctx, style) {
        ctx.rect(style.x, style.y, style.width, style.height);
        ctx.closePath();
    }
    function _iconTriangle(ctx, style) {
        var width = style.width / 2;
        var height = style.height / 2;
        var x = style.x + width;
        var y = style.y + height;
        var symbolSize = Math.min(width, height);
        ctx.moveTo(x, y - symbolSize);
        ctx.lineTo(x + symbolSize, y + symbolSize);
        ctx.lineTo(x - symbolSize, y + symbolSize);
        ctx.lineTo(x, y - symbolSize);
        ctx.closePath();
    }
    function _iconDroplet(ctx, style) {
        var DropletShape = require('zrender/shape/Droplet');
        DropletShape.prototype.buildPath(ctx, {
            x: style.x + style.width * 0.5,
            y: style.y + style.height * 0.5,
            a: style.width * 0.5,
            b: style.height * 0.8
        });
    }
    function _iconPin(ctx, style) {
        var x = style.x;
        var y = style.y - style.height / 2 * 1.5;
        var width = style.width / 2;
        var height = style.height / 2;
        var r = Math.min(width, height);
        ctx.arc(x + width, y + height, r, Math.PI / 5 * 4, Math.PI / 5);
        ctx.lineTo(x + width, y + height + r * 1.5);
        ctx.closePath();
    }
    function _iconImage(ctx, style, refreshNextFrame) {
        var ImageShape = require('zrender/shape/Image');
        this._imageShape = this._imageShape || new ImageShape({ style: {} });
        for (var name in style) {
            this._imageShape.style[name] = style[name];
        }
        this._imageShape.brush(ctx, false, refreshNextFrame);
    }
    var Base = require('zrender/shape/Base');
    function Icon(options) {
        Base.call(this, options);
    }
    Icon.prototype = {
        type: 'icon',
        iconLibrary: {
            mark: _iconMark,
            markUndo: _iconMarkUndo,
            restore: _iconRestore,
            saveAsImage: _iconSave,
            cross: _iconCross,
            circle: _iconCircle,
            rectangle: _iconRectangle,
            triangle: _iconTriangle,
            droplet: _iconDroplet,
            pin: _iconPin,
            image: _iconImage
        },
        brush: function (ctx, isHighlight, refreshNextFrame) {
            var style = isHighlight ? this.highlightStyle : this.style;
            style = style || {};
            var iconType = style.iconType || this.style.iconType;
            if (iconType === 'image') {
                var ImageShape = require('zrender/shape/Image');
                ImageShape.prototype.brush.call(this, ctx, isHighlight, refreshNextFrame);
            } else {
                var style = this.beforeBrush(ctx, isHighlight);
                ctx.beginPath();
                this.buildPath(ctx, style, refreshNextFrame);
                switch (style.brushType) {
                    case 'both':
                        ctx.fill();
                    case 'stroke':
                        style.lineWidth > 0 && ctx.stroke();
                        break;
                    default:
                        ctx.fill();
                }
                this.drawText(ctx, style, this.style);
                this.afterBrush(ctx);
            }
        },
        buildPath: function (ctx, style, refreshNextFrame) {
            if (this.iconLibrary[style.iconType]) {
                this.iconLibrary[style.iconType].call(this, ctx, style, refreshNextFrame);
            } else {
                ctx.moveTo(style.x, style.y);
                ctx.lineTo(style.x + style.width, style.y);
                ctx.lineTo(style.x + style.width, style.y + style.height);
                ctx.lineTo(style.x, style.y + style.height);
                ctx.lineTo(style.x, style.y);
                ctx.closePath();
            }
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            style.__rect = {
                x: Math.round(style.x),
                y: Math.round(style.y - (style.iconType == 'pin' ? style.height / 2 * 1.5 : 0)),
                width: style.width,
                height: style.height * (style.iconType === 'pin' ? 1.25 : 1)
            };
            return style.__rect;
        },
        isCover: function (x, y) {
            var originPos = this.transformCoordToLocal(x, y);
            x = originPos[0];
            y = originPos[1];
            var rect = this.style.__rect;
            if (!rect) {
                rect = this.style.__rect = this.getRect(this.style);
            }
            var delta = rect.height < 8 || rect.width < 8 ? 4 : 0;
            return x >= rect.x - delta && x <= rect.x + rect.width + delta && y >= rect.y - delta && y <= rect.y + rect.height + delta;
        }
    };
    zrUtil.inherits(Icon, Base);
    return Icon;
});define('echarts/util/shape/MarkLine', [
    'require',
    'zrender/shape/Base',
    './Icon',
    'zrender/shape/Line',
    'zrender/shape/BezierCurve',
    'zrender/tool/area',
    'zrender/shape/util/dashedLineTo',
    'zrender/tool/util',
    'zrender/tool/curve'
], function (require) {
    var Base = require('zrender/shape/Base');
    var IconShape = require('./Icon');
    var LineShape = require('zrender/shape/Line');
    var lineInstance = new LineShape({});
    var CurveShape = require('zrender/shape/BezierCurve');
    var curveInstance = new CurveShape({});
    var area = require('zrender/tool/area');
    var dashedLineTo = require('zrender/shape/util/dashedLineTo');
    var zrUtil = require('zrender/tool/util');
    var curveTool = require('zrender/tool/curve');
    function MarkLine(options) {
        Base.call(this, options);
        if (this.style.curveness > 0) {
            this.updatePoints(this.style);
        }
        if (this.highlightStyle.curveness > 0) {
            this.updatePoints(this.highlightStyle);
        }
    }
    MarkLine.prototype = {
        type: 'mark-line',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            ctx.save();
            this.setContext(ctx, style);
            this.setTransform(ctx);
            ctx.save();
            ctx.beginPath();
            this.buildPath(ctx, style);
            ctx.stroke();
            ctx.restore();
            this.brushSymbol(ctx, style, 0);
            this.brushSymbol(ctx, style, 1);
            this.drawText(ctx, style, this.style);
            ctx.restore();
        },
        buildPath: function (ctx, style) {
            var lineType = style.lineType || 'solid';
            ctx.moveTo(style.xStart, style.yStart);
            if (style.curveness > 0) {
                var lineDash = null;
                switch (lineType) {
                    case 'dashed':
                        lineDash = [
                            5,
                            5
                        ];
                        break;
                    case 'dotted':
                        lineDash = [
                            1,
                            1
                        ];
                        break;
                }
                if (lineDash && ctx.setLineDash) {
                    ctx.setLineDash(lineDash);
                }
                ctx.quadraticCurveTo(style.cpX1, style.cpY1, style.xEnd, style.yEnd);
            } else {
                if (lineType == 'solid') {
                    ctx.lineTo(style.xEnd, style.yEnd);
                } else {
                    var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                    dashedLineTo(ctx, style.xStart, style.yStart, style.xEnd, style.yEnd, dashLength);
                }
            }
        },
        updatePoints: function (style) {
            var curveness = style.curveness || 0;
            var inv = 1;
            var x0 = style.xStart;
            var y0 = style.yStart;
            var x2 = style.xEnd;
            var y2 = style.yEnd;
            var x1 = (x0 + x2) / 2 - inv * (y0 - y2) * curveness;
            var y1 = (y0 + y2) / 2 - inv * (x2 - x0) * curveness;
            style.cpX1 = x1;
            style.cpY1 = y1;
        },
        brushSymbol: function (ctx, style, idx) {
            if (style.symbol[idx] == 'none') {
                return;
            }
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = style.symbolBorder;
            ctx.strokeStyle = style.symbolBorderColor;
            var symbol = style.symbol[idx].replace('empty', '').toLowerCase();
            if (style.symbol[idx].match('empty')) {
                ctx.fillStyle = '#fff';
            }
            var x0 = style.xStart;
            var y0 = style.yStart;
            var x2 = style.xEnd;
            var y2 = style.yEnd;
            var x = idx === 0 ? x0 : x2;
            var y = idx === 0 ? y0 : y2;
            var curveness = style.curveness || 0;
            var rotate = style.symbolRotate[idx] != null ? style.symbolRotate[idx] - 0 : 0;
            rotate = rotate / 180 * Math.PI;
            if (symbol == 'arrow' && rotate === 0) {
                if (curveness === 0) {
                    var sign = idx === 0 ? -1 : 1;
                    rotate = Math.PI / 2 + Math.atan2(sign * (y2 - y0), sign * (x2 - x0));
                } else {
                    var x1 = style.cpX1;
                    var y1 = style.cpY1;
                    var quadraticDerivativeAt = curveTool.quadraticDerivativeAt;
                    var dx = quadraticDerivativeAt(x0, x1, x2, idx);
                    var dy = quadraticDerivativeAt(y0, y1, y2, idx);
                    rotate = Math.PI / 2 + Math.atan2(dy, dx);
                }
            }
            ctx.translate(x, y);
            if (rotate !== 0) {
                ctx.rotate(rotate);
            }
            var symbolSize = style.symbolSize[idx];
            IconShape.prototype.buildPath(ctx, {
                x: -symbolSize,
                y: -symbolSize,
                width: symbolSize * 2,
                height: symbolSize * 2,
                iconType: symbol
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },
        getRect: function (style) {
            style.curveness > 0 ? curveInstance.getRect(style) : lineInstance.getRect(style);
            return style.__rect;
        },
        isCover: function (x, y) {
            var originPos = this.transformCoordToLocal(x, y);
            x = originPos[0];
            y = originPos[1];
            if (this.isCoverRect(x, y)) {
                return this.style.curveness > 0 ? area.isInside(curveInstance, this.style, x, y) : area.isInside(lineInstance, this.style, x, y);
            }
            return false;
        }
    };
    zrUtil.inherits(MarkLine, Base);
    return MarkLine;
});define('echarts/util/shape/Symbol', [
    'require',
    'zrender/shape/Base',
    'zrender/shape/Polygon',
    'zrender/tool/util',
    './normalIsCover'
], function (require) {
    var Base = require('zrender/shape/Base');
    var PolygonShape = require('zrender/shape/Polygon');
    var polygonInstance = new PolygonShape({});
    var zrUtil = require('zrender/tool/util');
    function Symbol(options) {
        Base.call(this, options);
    }
    Symbol.prototype = {
        type: 'symbol',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            var len = pointList.length;
            if (len === 0) {
                return;
            }
            var subSize = 10000;
            var subSetLength = Math.ceil(len / subSize);
            var sub;
            var subLen;
            var isArray = pointList[0] instanceof Array;
            var size = style.size ? style.size : 2;
            var curSize = size;
            var halfSize = size / 2;
            var PI2 = Math.PI * 2;
            var percent;
            var x;
            var y;
            for (var j = 0; j < subSetLength; j++) {
                ctx.beginPath();
                sub = j * subSize;
                subLen = sub + subSize;
                subLen = subLen > len ? len : subLen;
                for (var i = sub; i < subLen; i++) {
                    if (style.random) {
                        percent = style['randomMap' + i % 20] / 100;
                        curSize = size * percent * percent;
                        halfSize = curSize / 2;
                    }
                    if (isArray) {
                        x = pointList[i][0];
                        y = pointList[i][1];
                    } else {
                        x = pointList[i].x;
                        y = pointList[i].y;
                    }
                    if (curSize < 3) {
                        ctx.rect(x - halfSize, y - halfSize, curSize, curSize);
                    } else {
                        switch (style.iconType) {
                            case 'circle':
                                ctx.moveTo(x, y);
                                ctx.arc(x, y, halfSize, 0, PI2, true);
                                break;
                            case 'diamond':
                                ctx.moveTo(x, y - halfSize);
                                ctx.lineTo(x + halfSize / 3, y - halfSize / 3);
                                ctx.lineTo(x + halfSize, y);
                                ctx.lineTo(x + halfSize / 3, y + halfSize / 3);
                                ctx.lineTo(x, y + halfSize);
                                ctx.lineTo(x - halfSize / 3, y + halfSize / 3);
                                ctx.lineTo(x - halfSize, y);
                                ctx.lineTo(x - halfSize / 3, y - halfSize / 3);
                                ctx.lineTo(x, y - halfSize);
                                break;
                            default:
                                ctx.rect(x - halfSize, y - halfSize, curSize, curSize);
                        }
                    }
                }
                ctx.closePath();
                if (j < subSetLength - 1) {
                    switch (style.brushType) {
                        case 'both':
                            ctx.fill();
                            style.lineWidth > 0 && ctx.stroke();
                            break;
                        case 'stroke':
                            style.lineWidth > 0 && ctx.stroke();
                            break;
                        default:
                            ctx.fill();
                    }
                }
            }
        },
        getRect: function (style) {
            return style.__rect || polygonInstance.getRect(style);
        },
        isCover: require('./normalIsCover')
    };
    zrUtil.inherits(Symbol, Base);
    return Symbol;
});define('zrender/shape/Polyline', [
    'require',
    './Base',
    './util/smoothSpline',
    './util/smoothBezier',
    './util/dashedLineTo',
    './Polygon',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var smoothSpline = require('./util/smoothSpline');
    var smoothBezier = require('./util/smoothBezier');
    var dashedLineTo = require('./util/dashedLineTo');
    var Polyline = function (options) {
        this.brushTypeOnly = 'stroke';
        this.textPosition = 'end';
        Base.call(this, options);
    };
    Polyline.prototype = {
        type: 'polyline',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            if (pointList.length < 2) {
                return;
            }
            var len = Math.min(style.pointList.length, Math.round(style.pointListLength || style.pointList.length));
            if (style.smooth && style.smooth !== 'spline') {
                if (!style.controlPointList) {
                    this.updateControlPoints(style);
                }
                var controlPointList = style.controlPointList;
                ctx.moveTo(pointList[0][0], pointList[0][1]);
                var cp1;
                var cp2;
                var p;
                for (var i = 0; i < len - 1; i++) {
                    cp1 = controlPointList[i * 2];
                    cp2 = controlPointList[i * 2 + 1];
                    p = pointList[i + 1];
                    ctx.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], p[0], p[1]);
                }
            } else {
                if (style.smooth === 'spline') {
                    pointList = smoothSpline(pointList);
                    len = pointList.length;
                }
                if (!style.lineType || style.lineType == 'solid') {
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1; i < len; i++) {
                        ctx.lineTo(pointList[i][0], pointList[i][1]);
                    }
                } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                    var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1; i < len; i++) {
                        dashedLineTo(ctx, pointList[i - 1][0], pointList[i - 1][1], pointList[i][0], pointList[i][1], dashLength);
                    }
                }
            }
            return;
        },
        updateControlPoints: function (style) {
            style.controlPointList = smoothBezier(style.pointList, style.smooth, false, style.smoothConstraint);
        },
        getRect: function (style) {
            return require('./Polygon').prototype.getRect(style);
        }
    };
    require('../tool/util').inherits(Polyline, Base);
    return Polyline;
});define('zrender/shape/ShapeBundle', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var ShapeBundle = function (options) {
        Base.call(this, options);
    };
    ShapeBundle.prototype = {
        constructor: ShapeBundle,
        type: 'shape-bundle',
        brush: function (ctx, isHighlight) {
            var style = this.beforeBrush(ctx, isHighlight);
            ctx.beginPath();
            for (var i = 0; i < style.shapeList.length; i++) {
                var subShape = style.shapeList[i];
                var subShapeStyle = subShape.style;
                if (isHighlight) {
                    subShapeStyle = subShape.getHighlightStyle(subShapeStyle, subShape.highlightStyle || {}, subShape.brushTypeOnly);
                }
                subShape.buildPath(ctx, subShapeStyle);
            }
            switch (style.brushType) {
                case 'both':
                    ctx.fill();
                case 'stroke':
                    style.lineWidth > 0 && ctx.stroke();
                    break;
                default:
                    ctx.fill();
            }
            this.drawText(ctx, style, this.style);
            this.afterBrush(ctx);
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var minX = Infinity;
            var maxX = -Infinity;
            var minY = Infinity;
            var maxY = -Infinity;
            for (var i = 0; i < style.shapeList.length; i++) {
                var subShape = style.shapeList[i];
                var subRect = subShape.getRect(subShape.style);
                var minX = Math.min(subRect.x, minX);
                var minY = Math.min(subRect.y, minY);
                var maxX = Math.max(subRect.x + subRect.width, maxX);
                var maxY = Math.max(subRect.y + subRect.height, maxY);
            }
            style.__rect = {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
            };
            return style.__rect;
        },
        isCover: function (x, y) {
            var originPos = this.transformCoordToLocal(x, y);
            x = originPos[0];
            y = originPos[1];
            if (this.isCoverRect(x, y)) {
                for (var i = 0; i < this.style.shapeList.length; i++) {
                    var subShape = this.style.shapeList[i];
                    if (subShape.isCover(x, y)) {
                        return true;
                    }
                }
            }
            return false;
        }
    };
    require('../tool/util').inherits(ShapeBundle, Base);
    return ShapeBundle;
});define('echarts/util/ecAnimation', [
    'require',
    'zrender/tool/util',
    'zrender/tool/curve',
    'zrender/shape/Polygon'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    var curveTool = require('zrender/tool/curve');
    function pointList(zr, oldShape, newShape, duration, easing) {
        var newPointList = newShape.style.pointList;
        var newPointListLen = newPointList.length;
        var oldPointList;
        if (!oldShape) {
            oldPointList = [];
            if (newShape._orient != 'vertical') {
                var y = newPointList[0][1];
                for (var i = 0; i < newPointListLen; i++) {
                    oldPointList[i] = [
                        newPointList[i][0],
                        y
                    ];
                }
            } else {
                var x = newPointList[0][0];
                for (var i = 0; i < newPointListLen; i++) {
                    oldPointList[i] = [
                        x,
                        newPointList[i][1]
                    ];
                }
            }
            if (newShape.type == 'half-smooth-polygon') {
                oldPointList[newPointListLen - 1] = zrUtil.clone(newPointList[newPointListLen - 1]);
                oldPointList[newPointListLen - 2] = zrUtil.clone(newPointList[newPointListLen - 2]);
            }
            oldShape = { style: { pointList: oldPointList } };
        }
        oldPointList = oldShape.style.pointList;
        var oldPointListLen = oldPointList.length;
        if (oldPointListLen == newPointListLen) {
            newShape.style.pointList = oldPointList;
        } else if (oldPointListLen < newPointListLen) {
            newShape.style.pointList = oldPointList.concat(newPointList.slice(oldPointListLen));
        } else {
            newShape.style.pointList = oldPointList.slice(0, newPointListLen);
        }
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, { pointList: newPointList }).during(function () {
            if (newShape.updateControlPoints) {
                newShape.updateControlPoints(newShape.style);
            }
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function cloneStyle(target, source) {
        var len = arguments.length;
        for (var i = 2; i < len; i++) {
            var prop = arguments[i];
            target.style[prop] = source.style[prop];
        }
    }
    function rectangle(zr, oldShape, newShape, duration, easing) {
        var newShapeStyle = newShape.style;
        if (!oldShape) {
            oldShape = {
                position: newShape.position,
                style: {
                    x: newShapeStyle.x,
                    y: newShape._orient == 'vertical' ? newShapeStyle.y + newShapeStyle.height : newShapeStyle.y,
                    width: newShape._orient == 'vertical' ? newShapeStyle.width : 0,
                    height: newShape._orient != 'vertical' ? newShapeStyle.height : 0
                }
            };
        }
        var newX = newShapeStyle.x;
        var newY = newShapeStyle.y;
        var newWidth = newShapeStyle.width;
        var newHeight = newShapeStyle.height;
        var newPosition = [
            newShape.position[0],
            newShape.position[1]
        ];
        cloneStyle(newShape, oldShape, 'x', 'y', 'width', 'height');
        newShape.position = oldShape.position;
        zr.addShape(newShape);
        if (newPosition[0] != oldShape.position[0] || newPosition[1] != oldShape.position[1]) {
            zr.animate(newShape.id, '').when(duration, { position: newPosition }).start(easing);
        }
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function candle(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            var y = newShape.style.y;
            oldShape = {
                style: {
                    y: [
                        y[0],
                        y[0],
                        y[0],
                        y[0]
                    ]
                }
            };
        }
        var newY = newShape.style.y;
        newShape.style.y = oldShape.style.y;
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, { y: newY }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function ring(zr, oldShape, newShape, duration, easing) {
        var x = newShape.style.x;
        var y = newShape.style.y;
        var r0 = newShape.style.r0;
        var r = newShape.style.r;
        newShape.__animating = true;
        if (newShape._animationAdd != 'r') {
            newShape.style.r0 = 0;
            newShape.style.r = 0;
            newShape.rotation = [
                Math.PI * 2,
                x,
                y
            ];
            zr.addShape(newShape);
            zr.animate(newShape.id, 'style').when(duration, {
                r0: r0,
                r: r
            }).done(function () {
                newShape.__animating = false;
            }).start(easing);
            zr.animate(newShape.id, '').when(duration, {
                rotation: [
                    0,
                    x,
                    y
                ]
            }).start(easing);
        } else {
            newShape.style.r0 = newShape.style.r;
            zr.addShape(newShape);
            zr.animate(newShape.id, 'style').when(duration, { r0: r0 }).done(function () {
                newShape.__animating = false;
            }).start(easing);
        }
    }
    function sector(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            if (newShape._animationAdd != 'r') {
                oldShape = {
                    style: {
                        startAngle: newShape.style.startAngle,
                        endAngle: newShape.style.startAngle
                    }
                };
            } else {
                oldShape = { style: { r0: newShape.style.r } };
            }
        }
        var startAngle = newShape.style.startAngle;
        var endAngle = newShape.style.endAngle;
        cloneStyle(newShape, oldShape, 'startAngle', 'endAngle');
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, {
            startAngle: startAngle,
            endAngle: endAngle
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function text(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    x: newShape.style.textAlign == 'left' ? newShape.style.x + 100 : newShape.style.x - 100,
                    y: newShape.style.y
                }
            };
        }
        var x = newShape.style.x;
        var y = newShape.style.y;
        cloneStyle(newShape, oldShape, 'x', 'y');
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, {
            x: x,
            y: y
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function polygon(zr, oldShape, newShape, duration, easing) {
        var rect = require('zrender/shape/Polygon').prototype.getRect(newShape.style);
        var x = rect.x + rect.width / 2;
        var y = rect.y + rect.height / 2;
        newShape.scale = [
            0.1,
            0.1,
            x,
            y
        ];
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, '').when(duration, {
            scale: [
                1,
                1,
                x,
                y
            ]
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function ribbon(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    source0: 0,
                    source1: newShape.style.source1 > 0 ? 360 : -360,
                    target0: 0,
                    target1: newShape.style.target1 > 0 ? 360 : -360
                }
            };
        }
        var source0 = newShape.style.source0;
        var source1 = newShape.style.source1;
        var target0 = newShape.style.target0;
        var target1 = newShape.style.target1;
        if (oldShape.style) {
            cloneStyle(newShape, oldShape, 'source0', 'source1', 'target0', 'target1');
        }
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, {
            source0: source0,
            source1: source1,
            target0: target0,
            target1: target1
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function gaugePointer(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = { style: { angle: newShape.style.startAngle } };
        }
        var angle = newShape.style.angle;
        newShape.style.angle = oldShape.style.angle;
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, { angle: angle }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function icon(zr, oldShape, newShape, duration, easing, delay) {
        newShape.style._x = newShape.style.x;
        newShape.style._y = newShape.style.y;
        newShape.style._width = newShape.style.width;
        newShape.style._height = newShape.style.height;
        if (!oldShape) {
            var x = newShape._x || 0;
            var y = newShape._y || 0;
            newShape.scale = [
                0.01,
                0.01,
                x,
                y
            ];
            zr.addShape(newShape);
            newShape.__animating = true;
            zr.animate(newShape.id, '').delay(delay).when(duration, {
                scale: [
                    1,
                    1,
                    x,
                    y
                ]
            }).done(function () {
                newShape.__animating = false;
            }).start(easing || 'QuinticOut');
        } else {
            rectangle(zr, oldShape, newShape, duration, easing);
        }
    }
    function line(zr, oldShape, newShape, duration, easing) {
        if (!oldShape) {
            oldShape = {
                style: {
                    xStart: newShape.style.xStart,
                    yStart: newShape.style.yStart,
                    xEnd: newShape.style.xStart,
                    yEnd: newShape.style.yStart
                }
            };
        }
        var xStart = newShape.style.xStart;
        var xEnd = newShape.style.xEnd;
        var yStart = newShape.style.yStart;
        var yEnd = newShape.style.yEnd;
        cloneStyle(newShape, oldShape, 'xStart', 'xEnd', 'yStart', 'yEnd');
        zr.addShape(newShape);
        newShape.__animating = true;
        zr.animate(newShape.id, 'style').when(duration, {
            xStart: xStart,
            xEnd: xEnd,
            yStart: yStart,
            yEnd: yEnd
        }).done(function () {
            newShape.__animating = false;
        }).start(easing);
    }
    function markline(zr, oldShape, newShape, duration, easing) {
        easing = easing || 'QuinticOut';
        newShape.__animating = true;
        zr.addShape(newShape);
        var newShapeStyle = newShape.style;
        var animationDone = function () {
            newShape.__animating = false;
        };
        var x0 = newShapeStyle.xStart;
        var y0 = newShapeStyle.yStart;
        var x2 = newShapeStyle.xEnd;
        var y2 = newShapeStyle.yEnd;
        if (newShapeStyle.curveness > 0) {
            newShape.updatePoints(newShapeStyle);
            var obj = { p: 0 };
            var x1 = newShapeStyle.cpX1;
            var y1 = newShapeStyle.cpY1;
            var newXArr = [];
            var newYArr = [];
            var subdivide = curveTool.quadraticSubdivide;
            zr.animation.animate(obj).when(duration, { p: 1 }).during(function () {
                subdivide(x0, x1, x2, obj.p, newXArr);
                subdivide(y0, y1, y2, obj.p, newYArr);
                newShapeStyle.cpX1 = newXArr[1];
                newShapeStyle.cpY1 = newYArr[1];
                newShapeStyle.xEnd = newXArr[2];
                newShapeStyle.yEnd = newYArr[2];
                zr.modShape(newShape);
            }).done(animationDone).start(easing);
        } else {
            zr.animate(newShape.id, 'style').when(0, {
                xEnd: x0,
                yEnd: y0
            }).when(duration, {
                xEnd: x2,
                yEnd: y2
            }).done(animationDone).start(easing);
        }
    }
    return {
        pointList: pointList,
        rectangle: rectangle,
        candle: candle,
        ring: ring,
        sector: sector,
        text: text,
        polygon: polygon,
        ribbon: ribbon,
        gaugePointer: gaugePointer,
        icon: icon,
        line: line,
        markline: markline
    };
});define('echarts/component/base', [
    'require',
    '../config',
    '../util/ecData',
    '../util/ecQuery',
    '../util/number',
    'zrender/tool/util',
    'zrender/tool/env'
], function (require) {
    var ecConfig = require('../config');
    var ecData = require('../util/ecData');
    var ecQuery = require('../util/ecQuery');
    var number = require('../util/number');
    var zrUtil = require('zrender/tool/util');
    function Base(ecTheme, messageCenter, zr, option, myChart) {
        this.ecTheme = ecTheme;
        this.messageCenter = messageCenter;
        this.zr = zr;
        this.option = option;
        this.series = option.series;
        this.myChart = myChart;
        this.component = myChart.component;
        this.shapeList = [];
        this.effectList = [];
        var self = this;
        self._onlegendhoverlink = function (param) {
            if (self.legendHoverLink) {
                var targetName = param.target;
                var name;
                for (var i = self.shapeList.length - 1; i >= 0; i--) {
                    name = self.type == ecConfig.CHART_TYPE_PIE || self.type == ecConfig.CHART_TYPE_FUNNEL ? ecData.get(self.shapeList[i], 'name') : (ecData.get(self.shapeList[i], 'series') || {}).name;
                    if (name == targetName && !self.shapeList[i].invisible && !self.shapeList[i].__animating) {
                        self.zr.addHoverShape(self.shapeList[i]);
                    }
                }
            }
        };
        messageCenter && messageCenter.bind(ecConfig.EVENT.LEGEND_HOVERLINK, this._onlegendhoverlink);
    }
    Base.prototype = {
        canvasSupported: require('zrender/tool/env').canvasSupported,
        _getZ: function (zWhat) {
            if (this[zWhat] != null) {
                return this[zWhat];
            }
            var opt = this.ecTheme[this.type];
            if (opt && opt[zWhat] != null) {
                return opt[zWhat];
            }
            opt = ecConfig[this.type];
            if (opt && opt[zWhat] != null) {
                return opt[zWhat];
            }
            return 0;
        },
        getZlevelBase: function () {
            return this._getZ('zlevel');
        },
        getZBase: function () {
            return this._getZ('z');
        },
        reformOption: function (opt) {
            opt = zrUtil.merge(zrUtil.merge(opt || {}, zrUtil.clone(this.ecTheme[this.type] || {})), zrUtil.clone(ecConfig[this.type] || {}));
            this.z = opt.z;
            this.zlevel = opt.zlevel;
            return opt;
        },
        reformCssArray: function (p) {
            if (p instanceof Array) {
                switch (p.length + '') {
                    case '4':
                        return p;
                    case '3':
                        return [
                            p[0],
                            p[1],
                            p[2],
                            p[1]
                        ];
                    case '2':
                        return [
                            p[0],
                            p[1],
                            p[0],
                            p[1]
                        ];
                    case '1':
                        return [
                            p[0],
                            p[0],
                            p[0],
                            p[0]
                        ];
                    case '0':
                        return [
                            0,
                            0,
                            0,
                            0
                        ];
                }
            } else {
                return [
                    p,
                    p,
                    p,
                    p
                ];
            }
        },
        getShapeById: function (id) {
            for (var i = 0, l = this.shapeList.length; i < l; i++) {
                if (this.shapeList[i].id === id) {
                    return this.shapeList[i];
                }
            }
            return null;
        },
        getFont: function (textStyle) {
            var finalTextStyle = this.getTextStyle(zrUtil.clone(textStyle));
            return finalTextStyle.fontStyle + ' ' + finalTextStyle.fontWeight + ' ' + finalTextStyle.fontSize + 'px ' + finalTextStyle.fontFamily;
        },
        getTextStyle: function (targetStyle) {
            return zrUtil.merge(zrUtil.merge(targetStyle || {}, this.ecTheme.textStyle), ecConfig.textStyle);
        },
        getItemStyleColor: function (itemColor, seriesIndex, dataIndex, data) {
            return typeof itemColor === 'function' ? itemColor.call(this.myChart, {
                seriesIndex: seriesIndex,
                series: this.series[seriesIndex],
                dataIndex: dataIndex,
                data: data
            }) : itemColor;
        },
        getDataFromOption: function (data, defaultData) {
            return data != null ? data.value != null ? data.value : data : defaultData;
        },
        subPixelOptimize: function (position, lineWidth) {
            if (lineWidth % 2 === 1) {
                position = Math.floor(position) + 0.5;
            } else {
                position = Math.round(position);
            }
            return position;
        },
        resize: function () {
            this.refresh && this.refresh();
            this.clearEffectShape && this.clearEffectShape(true);
            var self = this;
        },
        clear: function () {
            this.clearEffectShape && this.clearEffectShape();
            this.zr && this.zr.delShape(this.shapeList);
            this.shapeList = [];
        },
        dispose: function () {
            this.onbeforDispose && this.onbeforDispose();
            this.clear();
            this.shapeList = null;
            this.effectList = null;
            this.messageCenter && this.messageCenter.unbind(ecConfig.EVENT.LEGEND_HOVERLINK, this._onlegendhoverlink);
            this.onafterDispose && this.onafterDispose();
        },
        query: ecQuery.query,
        deepQuery: ecQuery.deepQuery,
        deepMerge: ecQuery.deepMerge,
        parsePercent: number.parsePercent,
        parseCenter: number.parseCenter,
        parseRadius: number.parseRadius,
        numAddCommas: number.addCommas
    };
    return Base;
});define('zrender/shape/Droplet', [
    'require',
    './Base',
    './util/PathProxy',
    '../tool/area',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var PathProxy = require('./util/PathProxy');
    var area = require('../tool/area');
    var Droplet = function (options) {
        Base.call(this, options);
        this._pathProxy = new PathProxy();
    };
    Droplet.prototype = {
        type: 'droplet',
        buildPath: function (ctx, style) {
            var path = this._pathProxy || new PathProxy();
            path.begin(ctx);
            path.moveTo(style.x, style.y + style.a);
            path.bezierCurveTo(style.x + style.a, style.y + style.a, style.x + style.a * 3 / 2, style.y - style.a / 3, style.x, style.y - style.b);
            path.bezierCurveTo(style.x - style.a * 3 / 2, style.y - style.a / 3, style.x - style.a, style.y + style.a, style.x, style.y + style.a);
            path.closePath();
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            if (!this._pathProxy.isEmpty()) {
                this.buildPath(null, style);
            }
            return this._pathProxy.fastBoundingRect();
        },
        isCover: function (x, y) {
            var originPos = this.transformCoordToLocal(x, y);
            x = originPos[0];
            y = originPos[1];
            if (this.isCoverRect(x, y)) {
                return area.isInsidePath(this._pathProxy.pathCommands, this.style.lineWidth, this.style.brushType, x, y);
            }
        }
    };
    require('../tool/util').inherits(Droplet, Base);
    return Droplet;
});define('zrender/tool/math', [], function () {
    var _radians = Math.PI / 180;
    function sin(angle, isDegrees) {
        return Math.sin(isDegrees ? angle * _radians : angle);
    }
    function cos(angle, isDegrees) {
        return Math.cos(isDegrees ? angle * _radians : angle);
    }
    function degreeToRadian(angle) {
        return angle * _radians;
    }
    function radianToDegree(angle) {
        return angle / _radians;
    }
    return {
        sin: sin,
        cos: cos,
        degreeToRadian: degreeToRadian,
        radianToDegree: radianToDegree
    };
});define('zrender/shape/util/PathProxy', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    var PathSegment = function (command, points) {
        this.command = command;
        this.points = points || null;
    };
    var PathProxy = function () {
        this.pathCommands = [];
        this._ctx = null;
        this._min = [];
        this._max = [];
    };
    PathProxy.prototype.fastBoundingRect = function () {
        var min = this._min;
        var max = this._max;
        min[0] = min[1] = Infinity;
        max[0] = max[1] = -Infinity;
        for (var i = 0; i < this.pathCommands.length; i++) {
            var seg = this.pathCommands[i];
            var p = seg.points;
            switch (seg.command) {
                case 'M':
                    vector.min(min, min, p);
                    vector.max(max, max, p);
                    break;
                case 'L':
                    vector.min(min, min, p);
                    vector.max(max, max, p);
                    break;
                case 'C':
                    for (var j = 0; j < 6; j += 2) {
                        min[0] = Math.min(min[0], min[0], p[j]);
                        min[1] = Math.min(min[1], min[1], p[j + 1]);
                        max[0] = Math.max(max[0], max[0], p[j]);
                        max[1] = Math.max(max[1], max[1], p[j + 1]);
                    }
                    break;
                case 'Q':
                    for (var j = 0; j < 4; j += 2) {
                        min[0] = Math.min(min[0], min[0], p[j]);
                        min[1] = Math.min(min[1], min[1], p[j + 1]);
                        max[0] = Math.max(max[0], max[0], p[j]);
                        max[1] = Math.max(max[1], max[1], p[j + 1]);
                    }
                    break;
                case 'A':
                    var cx = p[0];
                    var cy = p[1];
                    var rx = p[2];
                    var ry = p[3];
                    min[0] = Math.min(min[0], min[0], cx - rx);
                    min[1] = Math.min(min[1], min[1], cy - ry);
                    max[0] = Math.max(max[0], max[0], cx + rx);
                    max[1] = Math.max(max[1], max[1], cy + ry);
                    break;
            }
        }
        return {
            x: min[0],
            y: min[1],
            width: max[0] - min[0],
            height: max[1] - min[1]
        };
    };
    PathProxy.prototype.begin = function (ctx) {
        this._ctx = ctx || null;
        this.pathCommands.length = 0;
        return this;
    };
    PathProxy.prototype.moveTo = function (x, y) {
        this.pathCommands.push(new PathSegment('M', [
            x,
            y
        ]));
        if (this._ctx) {
            this._ctx.moveTo(x, y);
        }
        return this;
    };
    PathProxy.prototype.lineTo = function (x, y) {
        this.pathCommands.push(new PathSegment('L', [
            x,
            y
        ]));
        if (this._ctx) {
            this._ctx.lineTo(x, y);
        }
        return this;
    };
    PathProxy.prototype.bezierCurveTo = function (x1, y1, x2, y2, x3, y3) {
        this.pathCommands.push(new PathSegment('C', [
            x1,
            y1,
            x2,
            y2,
            x3,
            y3
        ]));
        if (this._ctx) {
            this._ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        }
        return this;
    };
    PathProxy.prototype.quadraticCurveTo = function (x1, y1, x2, y2) {
        this.pathCommands.push(new PathSegment('Q', [
            x1,
            y1,
            x2,
            y2
        ]));
        if (this._ctx) {
            this._ctx.quadraticCurveTo(x1, y1, x2, y2);
        }
        return this;
    };
    PathProxy.prototype.arc = function (cx, cy, r, startAngle, endAngle, anticlockwise) {
        this.pathCommands.push(new PathSegment('A', [
            cx,
            cy,
            r,
            r,
            startAngle,
            endAngle - startAngle,
            0,
            anticlockwise ? 0 : 1
        ]));
        if (this._ctx) {
            this._ctx.arc(cx, cy, r, startAngle, endAngle, anticlockwise);
        }
        return this;
    };
    PathProxy.prototype.arcTo = function (x1, y1, x2, y2, radius) {
        if (this._ctx) {
            this._ctx.arcTo(x1, y1, x2, y2, radius);
        }
        return this;
    };
    PathProxy.prototype.rect = function (x, y, w, h) {
        if (this._ctx) {
            this._ctx.rect(x, y, w, h);
        }
        return this;
    };
    PathProxy.prototype.closePath = function () {
        this.pathCommands.push(new PathSegment('z'));
        if (this._ctx) {
            this._ctx.closePath();
        }
        return this;
    };
    PathProxy.prototype.isEmpty = function () {
        return this.pathCommands.length === 0;
    };
    PathProxy.PathSegment = PathSegment;
    return PathProxy;
});define('zrender/shape/Line', [
    'require',
    './Base',
    './util/dashedLineTo',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var dashedLineTo = require('./util/dashedLineTo');
    var Line = function (options) {
        this.brushTypeOnly = 'stroke';
        this.textPosition = 'end';
        Base.call(this, options);
    };
    Line.prototype = {
        type: 'line',
        buildPath: function (ctx, style) {
            if (!style.lineType || style.lineType == 'solid') {
                ctx.moveTo(style.xStart, style.yStart);
                ctx.lineTo(style.xEnd, style.yEnd);
            } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                dashedLineTo(ctx, style.xStart, style.yStart, style.xEnd, style.yEnd, dashLength);
            }
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth = style.lineWidth || 1;
            style.__rect = {
                x: Math.min(style.xStart, style.xEnd) - lineWidth,
                y: Math.min(style.yStart, style.yEnd) - lineWidth,
                width: Math.abs(style.xStart - style.xEnd) + lineWidth,
                height: Math.abs(style.yStart - style.yEnd) + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Line, Base);
    return Line;
});define('zrender/shape/BezierCurve', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    'use strict';
    var Base = require('./Base');
    var BezierCurve = function (options) {
        this.brushTypeOnly = 'stroke';
        this.textPosition = 'end';
        Base.call(this, options);
    };
    BezierCurve.prototype = {
        type: 'bezier-curve',
        buildPath: function (ctx, style) {
            ctx.moveTo(style.xStart, style.yStart);
            if (typeof style.cpX2 != 'undefined' && typeof style.cpY2 != 'undefined') {
                ctx.bezierCurveTo(style.cpX1, style.cpY1, style.cpX2, style.cpY2, style.xEnd, style.yEnd);
            } else {
                ctx.quadraticCurveTo(style.cpX1, style.cpY1, style.xEnd, style.yEnd);
            }
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var _minX = Math.min(style.xStart, style.xEnd, style.cpX1);
            var _minY = Math.min(style.yStart, style.yEnd, style.cpY1);
            var _maxX = Math.max(style.xStart, style.xEnd, style.cpX1);
            var _maxY = Math.max(style.yStart, style.yEnd, style.cpY1);
            var _x2 = style.cpX2;
            var _y2 = style.cpY2;
            if (typeof _x2 != 'undefined' && typeof _y2 != 'undefined') {
                _minX = Math.min(_minX, _x2);
                _minY = Math.min(_minY, _y2);
                _maxX = Math.max(_maxX, _x2);
                _maxY = Math.max(_maxY, _y2);
            }
            var lineWidth = style.lineWidth || 1;
            style.__rect = {
                x: _minX - lineWidth,
                y: _minY - lineWidth,
                width: _maxX - _minX + lineWidth,
                height: _maxY - _minY + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(BezierCurve, Base);
    return BezierCurve;
});define('zrender/shape/util/dashedLineTo', [], function () {
    var dashPattern = [
        5,
        5
    ];
    return function (ctx, x1, y1, x2, y2, dashLength) {
        if (ctx.setLineDash) {
            dashPattern[0] = dashPattern[1] = dashLength;
            ctx.setLineDash(dashPattern);
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            return;
        }
        dashLength = typeof dashLength != 'number' ? 5 : dashLength;
        var dx = x2 - x1;
        var dy = y2 - y1;
        var numDashes = Math.floor(Math.sqrt(dx * dx + dy * dy) / dashLength);
        dx = dx / numDashes;
        dy = dy / numDashes;
        var flag = true;
        for (var i = 0; i < numDashes; ++i) {
            if (flag) {
                ctx.moveTo(x1, y1);
            } else {
                ctx.lineTo(x1, y1);
            }
            flag = !flag;
            x1 += dx;
            y1 += dy;
        }
        ctx.lineTo(x2, y2);
    };
});define('zrender/shape/Polygon', [
    'require',
    './Base',
    './util/smoothSpline',
    './util/smoothBezier',
    './util/dashedLineTo',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var smoothSpline = require('./util/smoothSpline');
    var smoothBezier = require('./util/smoothBezier');
    var dashedLineTo = require('./util/dashedLineTo');
    var Polygon = function (options) {
        Base.call(this, options);
    };
    Polygon.prototype = {
        type: 'polygon',
        buildPath: function (ctx, style) {
            var pointList = style.pointList;
            if (pointList.length < 2) {
                return;
            }
            if (style.smooth && style.smooth !== 'spline') {
                var controlPoints = smoothBezier(pointList, style.smooth, true, style.smoothConstraint);
                ctx.moveTo(pointList[0][0], pointList[0][1]);
                var cp1;
                var cp2;
                var p;
                var len = pointList.length;
                for (var i = 0; i < len; i++) {
                    cp1 = controlPoints[i * 2];
                    cp2 = controlPoints[i * 2 + 1];
                    p = pointList[(i + 1) % len];
                    ctx.bezierCurveTo(cp1[0], cp1[1], cp2[0], cp2[1], p[0], p[1]);
                }
            } else {
                if (style.smooth === 'spline') {
                    pointList = smoothSpline(pointList, true);
                }
                if (!style.lineType || style.lineType == 'solid') {
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1, l = pointList.length; i < l; i++) {
                        ctx.lineTo(pointList[i][0], pointList[i][1]);
                    }
                    ctx.lineTo(pointList[0][0], pointList[0][1]);
                } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                    var dashLength = style._dashLength || (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                    style._dashLength = dashLength;
                    ctx.moveTo(pointList[0][0], pointList[0][1]);
                    for (var i = 1, l = pointList.length; i < l; i++) {
                        dashedLineTo(ctx, pointList[i - 1][0], pointList[i - 1][1], pointList[i][0], pointList[i][1], dashLength);
                    }
                    dashedLineTo(ctx, pointList[pointList.length - 1][0], pointList[pointList.length - 1][1], pointList[0][0], pointList[0][1], dashLength);
                }
            }
            ctx.closePath();
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var minX = Number.MAX_VALUE;
            var maxX = Number.MIN_VALUE;
            var minY = Number.MAX_VALUE;
            var maxY = Number.MIN_VALUE;
            var pointList = style.pointList;
            for (var i = 0, l = pointList.length; i < l; i++) {
                if (pointList[i][0] < minX) {
                    minX = pointList[i][0];
                }
                if (pointList[i][0] > maxX) {
                    maxX = pointList[i][0];
                }
                if (pointList[i][1] < minY) {
                    minY = pointList[i][1];
                }
                if (pointList[i][1] > maxY) {
                    maxY = pointList[i][1];
                }
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(minX - lineWidth / 2),
                y: Math.round(minY - lineWidth / 2),
                width: maxX - minX + lineWidth,
                height: maxY - minY + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Polygon, Base);
    return Polygon;
});define('echarts/util/shape/normalIsCover', [], function () {
    return function (x, y) {
        var originPos = this.transformCoordToLocal(x, y);
        x = originPos[0];
        y = originPos[1];
        return this.isCoverRect(x, y);
    };
});define('zrender/shape/util/smoothSpline', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    function interpolate(p0, p1, p2, p3, t, t2, t3) {
        var v0 = (p2 - p0) * 0.5;
        var v1 = (p3 - p1) * 0.5;
        return (2 * (p1 - p2) + v0 + v1) * t3 + (-3 * (p1 - p2) - 2 * v0 - v1) * t2 + v0 * t + p1;
    }
    return function (points, isLoop, constraint) {
        var len = points.length;
        var ret = [];
        var distance = 0;
        for (var i = 1; i < len; i++) {
            distance += vector.distance(points[i - 1], points[i]);
        }
        var segs = distance / 5;
        segs = segs < len ? len : segs;
        for (var i = 0; i < segs; i++) {
            var pos = i / (segs - 1) * (isLoop ? len : len - 1);
            var idx = Math.floor(pos);
            var w = pos - idx;
            var p0;
            var p1 = points[idx % len];
            var p2;
            var p3;
            if (!isLoop) {
                p0 = points[idx === 0 ? idx : idx - 1];
                p2 = points[idx > len - 2 ? len - 1 : idx + 1];
                p3 = points[idx > len - 3 ? len - 1 : idx + 2];
            } else {
                p0 = points[(idx - 1 + len) % len];
                p2 = points[(idx + 1) % len];
                p3 = points[(idx + 2) % len];
            }
            var w2 = w * w;
            var w3 = w * w2;
            ret.push([
                interpolate(p0[0], p1[0], p2[0], p3[0], w, w2, w3),
                interpolate(p0[1], p1[1], p2[1], p3[1], w, w2, w3)
            ]);
        }
        return ret;
    };
});define('zrender/shape/util/smoothBezier', [
    'require',
    '../../tool/vector'
], function (require) {
    var vector = require('../../tool/vector');
    return function (points, smooth, isLoop, constraint) {
        var cps = [];
        var v = [];
        var v1 = [];
        var v2 = [];
        var prevPoint;
        var nextPoint;
        var hasConstraint = !!constraint;
        var min, max;
        if (hasConstraint) {
            min = [
                Infinity,
                Infinity
            ];
            max = [
                -Infinity,
                -Infinity
            ];
            for (var i = 0, len = points.length; i < len; i++) {
                vector.min(min, min, points[i]);
                vector.max(max, max, points[i]);
            }
            vector.min(min, min, constraint[0]);
            vector.max(max, max, constraint[1]);
        }
        for (var i = 0, len = points.length; i < len; i++) {
            var point = points[i];
            var prevPoint;
            var nextPoint;
            if (isLoop) {
                prevPoint = points[i ? i - 1 : len - 1];
                nextPoint = points[(i + 1) % len];
            } else {
                if (i === 0 || i === len - 1) {
                    cps.push(vector.clone(points[i]));
                    continue;
                } else {
                    prevPoint = points[i - 1];
                    nextPoint = points[i + 1];
                }
            }
            vector.sub(v, nextPoint, prevPoint);
            vector.scale(v, v, smooth);
            var d0 = vector.distance(point, prevPoint);
            var d1 = vector.distance(point, nextPoint);
            var sum = d0 + d1;
            if (sum !== 0) {
                d0 /= sum;
                d1 /= sum;
            }
            vector.scale(v1, v, -d0);
            vector.scale(v2, v, d1);
            var cp0 = vector.add([], point, v1);
            var cp1 = vector.add([], point, v2);
            if (hasConstraint) {
                vector.max(cp0, cp0, min);
                vector.min(cp0, cp0, max);
                vector.max(cp1, cp1, min);
                vector.min(cp1, cp1, max);
            }
            cps.push(cp0);
            cps.push(cp1);
        }
        if (isLoop) {
            cps.push(vector.clone(cps.shift()));
        }
        return cps;
    };
});define('echarts/util/ecQuery', [
    'require',
    'zrender/tool/util'
], function (require) {
    var zrUtil = require('zrender/tool/util');
    function query(optionTarget, optionLocation) {
        if (typeof optionTarget == 'undefined') {
            return;
        }
        if (!optionLocation) {
            return optionTarget;
        }
        optionLocation = optionLocation.split('.');
        var length = optionLocation.length;
        var curIdx = 0;
        while (curIdx < length) {
            optionTarget = optionTarget[optionLocation[curIdx]];
            if (typeof optionTarget == 'undefined') {
                return;
            }
            curIdx++;
        }
        return optionTarget;
    }
    function deepQuery(ctrList, optionLocation) {
        var finalOption;
        for (var i = 0, l = ctrList.length; i < l; i++) {
            finalOption = query(ctrList[i], optionLocation);
            if (typeof finalOption != 'undefined') {
                return finalOption;
            }
        }
    }
    function deepMerge(ctrList, optionLocation) {
        var finalOption;
        var len = ctrList.length;
        while (len--) {
            var tempOption = query(ctrList[len], optionLocation);
            if (typeof tempOption != 'undefined') {
                if (typeof finalOption == 'undefined') {
                    finalOption = zrUtil.clone(tempOption);
                } else {
                    zrUtil.merge(finalOption, tempOption, true);
                }
            }
        }
        return finalOption;
    }
    return {
        query: query,
        deepQuery: deepQuery,
        deepMerge: deepMerge
    };
});define('echarts/util/number', [], function () {
    function _trim(str) {
        return str.replace(/^\s+/, '').replace(/\s+$/, '');
    }
    function parsePercent(value, maxValue) {
        if (typeof value === 'string') {
            if (_trim(value).match(/%$/)) {
                return parseFloat(value) / 100 * maxValue;
            }
            return parseFloat(value);
        }
        return value;
    }
    function parseCenter(zr, center) {
        return [
            parsePercent(center[0], zr.getWidth()),
            parsePercent(center[1], zr.getHeight())
        ];
    }
    function parseRadius(zr, radius) {
        if (!(radius instanceof Array)) {
            radius = [
                0,
                radius
            ];
        }
        var zrSize = Math.min(zr.getWidth(), zr.getHeight()) / 2;
        return [
            parsePercent(radius[0], zrSize),
            parsePercent(radius[1], zrSize)
        ];
    }
    function addCommas(x) {
        if (isNaN(x)) {
            return '-';
        }
        x = (x + '').split('.');
        return x[0].replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, '$1,') + (x.length > 1 ? '.' + x[1] : '');
    }
    /*added by wwtang @2016.12.26 begin */
    function getPrecision(val) {
        var e = 1;
        var count = 0;
        while (Math.round(val * e) / e !== val) {
            e *= 10;
            count++;
        }
        return count;
    }
    /*added by wwtang @2016.12.26 end */
    return {
        parsePercent: parsePercent,
        parseCenter: parseCenter,
        parseRadius: parseRadius,
        addCommas: addCommas
    };
});define('echarts/data/KDTree', [
    'require',
    './quickSelect'
], function (require) {
    var quickSelect = require('./quickSelect');
    function Node(axis, data) {
        this.left = null;
        this.right = null;
        this.axis = axis;
        this.data = data;
    }
    var KDTree = function (points, dimension) {
        if (!points.length) {
            return;
        }
        if (!dimension) {
            dimension = points[0].array.length;
        }
        this.dimension = dimension;
        this.root = this._buildTree(points, 0, points.length - 1, 0);
        this._stack = [];
        this._nearstNList = [];
    };
    KDTree.prototype._buildTree = function (points, left, right, axis) {
        if (right < left) {
            return null;
        }
        var medianIndex = Math.floor((left + right) / 2);
        medianIndex = quickSelect(points, left, right, medianIndex, function (a, b) {
            return a.array[axis] - b.array[axis];
        });
        var median = points[medianIndex];
        var node = new Node(axis, median);
        axis = (axis + 1) % this.dimension;
        if (right > left) {
            node.left = this._buildTree(points, left, medianIndex - 1, axis);
            node.right = this._buildTree(points, medianIndex + 1, right, axis);
        }
        return node;
    };
    KDTree.prototype.nearest = function (target, squaredDistance) {
        var curr = this.root;
        var stack = this._stack;
        var idx = 0;
        var minDist = Infinity;
        var nearestNode = null;
        if (curr.data !== target) {
            minDist = squaredDistance(curr.data, target);
            nearestNode = curr;
        }
        if (target.array[curr.axis] < curr.data.array[curr.axis]) {
            curr.right && (stack[idx++] = curr.right);
            curr.left && (stack[idx++] = curr.left);
        } else {
            curr.left && (stack[idx++] = curr.left);
            curr.right && (stack[idx++] = curr.right);
        }
        while (idx--) {
            curr = stack[idx];
            var currDist = target.array[curr.axis] - curr.data.array[curr.axis];
            var isLeft = currDist < 0;
            var needsCheckOtherSide = false;
            currDist = currDist * currDist;
            if (currDist < minDist) {
                currDist = squaredDistance(curr.data, target);
                if (currDist < minDist && curr.data !== target) {
                    minDist = currDist;
                    nearestNode = curr;
                }
                needsCheckOtherSide = true;
            }
            if (isLeft) {
                if (needsCheckOtherSide) {
                    curr.right && (stack[idx++] = curr.right);
                }
                curr.left && (stack[idx++] = curr.left);
            } else {
                if (needsCheckOtherSide) {
                    curr.left && (stack[idx++] = curr.left);
                }
                curr.right && (stack[idx++] = curr.right);
            }
        }
        return nearestNode.data;
    };
    KDTree.prototype._addNearest = function (found, dist, node) {
        var nearestNList = this._nearstNList;
        for (var i = found - 1; i > 0; i--) {
            if (dist >= nearestNList[i - 1].dist) {
                break;
            } else {
                nearestNList[i].dist = nearestNList[i - 1].dist;
                nearestNList[i].node = nearestNList[i - 1].node;
            }
        }
        nearestNList[i].dist = dist;
        nearestNList[i].node = node;
    };
    KDTree.prototype.nearestN = function (target, N, squaredDistance, output) {
        if (N <= 0) {
            output.length = 0;
            return output;
        }
        var curr = this.root;
        var stack = this._stack;
        var idx = 0;
        var nearestNList = this._nearstNList;
        for (var i = 0; i < N; i++) {
            if (!nearestNList[i]) {
                nearestNList[i] = {};
            }
            nearestNList[i].dist = 0;
            nearestNList[i].node = null;
        }
        var currDist = squaredDistance(curr.data, target);
        var found = 0;
        if (curr.data !== target) {
            found++;
            this._addNearest(found, currDist, curr);
        }
        if (target.array[curr.axis] < curr.data.array[curr.axis]) {
            curr.right && (stack[idx++] = curr.right);
            curr.left && (stack[idx++] = curr.left);
        } else {
            curr.left && (stack[idx++] = curr.left);
            curr.right && (stack[idx++] = curr.right);
        }
        while (idx--) {
            curr = stack[idx];
            var currDist = target.array[curr.axis] - curr.data.array[curr.axis];
            var isLeft = currDist < 0;
            var needsCheckOtherSide = false;
            currDist = currDist * currDist;
            if (found < N || currDist < nearestNList[found - 1].dist) {
                currDist = squaredDistance(curr.data, target);
                if ((found < N || currDist < nearestNList[found - 1].dist) && curr.data !== target) {
                    if (found < N) {
                        found++;
                    }
                    this._addNearest(found, currDist, curr);
                }
                needsCheckOtherSide = true;
            }
            if (isLeft) {
                if (needsCheckOtherSide) {
                    curr.right && (stack[idx++] = curr.right);
                }
                curr.left && (stack[idx++] = curr.left);
            } else {
                if (needsCheckOtherSide) {
                    curr.left && (stack[idx++] = curr.left);
                }
                curr.right && (stack[idx++] = curr.right);
            }
        }
        for (var i = 0; i < found; i++) {
            output[i] = nearestNList[i].node.data;
        }
        output.length = found;
        return output;
    };
    return KDTree;
});define('echarts/data/quickSelect', ['require'], function (require) {
    function defaultCompareFunc(a, b) {
        return a - b;
    }
    function swapElement(list, idx0, idx1) {
        var tmp = list[idx0];
        list[idx0] = list[idx1];
        list[idx1] = tmp;
    }
    function select(list, left, right, nth, compareFunc) {
        var pivotIdx = left;
        while (right > left) {
            var pivotIdx = Math.round((right + left) / 2);
            var pivotValue = list[pivotIdx];
            swapElement(list, pivotIdx, right);
            pivotIdx = left;
            for (var i = left; i <= right - 1; i++) {
                if (compareFunc(pivotValue, list[i]) >= 0) {
                    swapElement(list, i, pivotIdx);
                    pivotIdx++;
                }
            }
            swapElement(list, right, pivotIdx);
            if (pivotIdx === nth) {
                return pivotIdx;
            } else if (pivotIdx < nth) {
                left = pivotIdx + 1;
            } else {
                right = pivotIdx - 1;
            }
        }
        return left;
    }
    function quickSelect(list, left, right, nth, compareFunc) {
        if (arguments.length <= 3) {
            nth = left;
            if (arguments.length == 2) {
                compareFunc = defaultCompareFunc;
            } else {
                compareFunc = right;
            }
            left = 0;
            right = list.length - 1;
        }
        return select(list, left, right, nth, compareFunc);
    }
    return quickSelect;
});define('echarts/util/shape/Cross', [
    'require',
    'zrender/shape/Base',
    'zrender/shape/Line',
    'zrender/tool/util',
    './normalIsCover'
], function (require) {
    var Base = require('zrender/shape/Base');
    var LineShape = require('zrender/shape/Line');
    var zrUtil = require('zrender/tool/util');
    function Cross(options) {
        Base.call(this, options);
    }
    Cross.prototype = {
        type: 'cross',
        buildPath: function (ctx, style) {
            var rect = style.rect;
            style.xStart = rect.x;
            style.xEnd = rect.x + rect.width;
            style.yStart = style.yEnd = style.y;
            LineShape.prototype.buildPath(ctx, style);
            style.xStart = style.xEnd = style.x;
            style.yStart = rect.y;
            style.yEnd = rect.y + rect.height;
            LineShape.prototype.buildPath(ctx, style);
        },
        getRect: function (style) {
            return style.rect;
        },
        isCover: require('./normalIsCover')
    };
    zrUtil.inherits(Cross, Base);
    return Cross;
});define('zrender/tool/computeBoundingBox', [
    'require',
    './vector',
    './curve'
], function (require) {
    var vec2 = require('./vector');
    var curve = require('./curve');
    function computeBoundingBox(points, min, max) {
        if (points.length === 0) {
            return;
        }
        var left = points[0][0];
        var right = points[0][0];
        var top = points[0][1];
        var bottom = points[0][1];
        for (var i = 1; i < points.length; i++) {
            var p = points[i];
            if (p[0] < left) {
                left = p[0];
            }
            if (p[0] > right) {
                right = p[0];
            }
            if (p[1] < top) {
                top = p[1];
            }
            if (p[1] > bottom) {
                bottom = p[1];
            }
        }
        min[0] = left;
        min[1] = top;
        max[0] = right;
        max[1] = bottom;
    }
    function computeCubeBezierBoundingBox(p0, p1, p2, p3, min, max) {
        var xDim = [];
        curve.cubicExtrema(p0[0], p1[0], p2[0], p3[0], xDim);
        for (var i = 0; i < xDim.length; i++) {
            xDim[i] = curve.cubicAt(p0[0], p1[0], p2[0], p3[0], xDim[i]);
        }
        var yDim = [];
        curve.cubicExtrema(p0[1], p1[1], p2[1], p3[1], yDim);
        for (var i = 0; i < yDim.length; i++) {
            yDim[i] = curve.cubicAt(p0[1], p1[1], p2[1], p3[1], yDim[i]);
        }
        xDim.push(p0[0], p3[0]);
        yDim.push(p0[1], p3[1]);
        var left = Math.min.apply(null, xDim);
        var right = Math.max.apply(null, xDim);
        var top = Math.min.apply(null, yDim);
        var bottom = Math.max.apply(null, yDim);
        min[0] = left;
        min[1] = top;
        max[0] = right;
        max[1] = bottom;
    }
    function computeQuadraticBezierBoundingBox(p0, p1, p2, min, max) {
        var t1 = curve.quadraticExtremum(p0[0], p1[0], p2[0]);
        var t2 = curve.quadraticExtremum(p0[1], p1[1], p2[1]);
        t1 = Math.max(Math.min(t1, 1), 0);
        t2 = Math.max(Math.min(t2, 1), 0);
        var ct1 = 1 - t1;
        var ct2 = 1 - t2;
        var x1 = ct1 * ct1 * p0[0] + 2 * ct1 * t1 * p1[0] + t1 * t1 * p2[0];
        var y1 = ct1 * ct1 * p0[1] + 2 * ct1 * t1 * p1[1] + t1 * t1 * p2[1];
        var x2 = ct2 * ct2 * p0[0] + 2 * ct2 * t2 * p1[0] + t2 * t2 * p2[0];
        var y2 = ct2 * ct2 * p0[1] + 2 * ct2 * t2 * p1[1] + t2 * t2 * p2[1];
        min[0] = Math.min(p0[0], p2[0], x1, x2);
        min[1] = Math.min(p0[1], p2[1], y1, y2);
        max[0] = Math.max(p0[0], p2[0], x1, x2);
        max[1] = Math.max(p0[1], p2[1], y1, y2);
    }
    var start = vec2.create();
    var end = vec2.create();
    var extremity = vec2.create();
    var computeArcBoundingBox = function (x, y, r, startAngle, endAngle, anticlockwise, min, max) {
        if (Math.abs(startAngle - endAngle) >= Math.PI * 2) {
            min[0] = x - r;
            min[1] = y - r;
            max[0] = x + r;
            max[1] = y + r;
            return;
        }
        start[0] = Math.cos(startAngle) * r + x;
        start[1] = Math.sin(startAngle) * r + y;
        end[0] = Math.cos(endAngle) * r + x;
        end[1] = Math.sin(endAngle) * r + y;
        vec2.min(min, start, end);
        vec2.max(max, start, end);
        startAngle = startAngle % (Math.PI * 2);
        if (startAngle < 0) {
            startAngle = startAngle + Math.PI * 2;
        }
        endAngle = endAngle % (Math.PI * 2);
        if (endAngle < 0) {
            endAngle = endAngle + Math.PI * 2;
        }
        if (startAngle > endAngle && !anticlockwise) {
            endAngle += Math.PI * 2;
        } else if (startAngle < endAngle && anticlockwise) {
            startAngle += Math.PI * 2;
        }
        if (anticlockwise) {
            var tmp = endAngle;
            endAngle = startAngle;
            startAngle = tmp;
        }
        for (var angle = 0; angle < endAngle; angle += Math.PI / 2) {
            if (angle > startAngle) {
                extremity[0] = Math.cos(angle) * r + x;
                extremity[1] = Math.sin(angle) * r + y;
                vec2.min(min, extremity, min);
                vec2.max(max, extremity, max);
            }
        }
    };
    computeBoundingBox.cubeBezier = computeCubeBezierBoundingBox;
    computeBoundingBox.quadraticBezier = computeQuadraticBezierBoundingBox;
    computeBoundingBox.arc = computeArcBoundingBox;
    return computeBoundingBox;
});define('echarts/util/shape/Chain', [
    'require',
    'zrender/shape/Base',
    './Icon',
    'zrender/shape/util/dashedLineTo',
    'zrender/tool/util',
    'zrender/tool/matrix'
], function (require) {
    var Base = require('zrender/shape/Base');
    var IconShape = require('./Icon');
    var dashedLineTo = require('zrender/shape/util/dashedLineTo');
    var zrUtil = require('zrender/tool/util');
    var matrix = require('zrender/tool/matrix');
    function Chain(options) {
        Base.call(this, options);
    }
    Chain.prototype = {
        type: 'chain',
        brush: function (ctx, isHighlight) {
            var style = this.style;
            if (isHighlight) {
                style = this.getHighlightStyle(style, this.highlightStyle || {});
            }
            ctx.save();
            this.setContext(ctx, style);
            this.setTransform(ctx);
            ctx.save();
            ctx.beginPath();
            this.buildLinePath(ctx, style);
            ctx.stroke();
            ctx.restore();
            this.brushSymbol(ctx, style);
            ctx.restore();
            return;
        },
        buildLinePath: function (ctx, style) {
            var x = style.x;
            var y = style.y + 5;
            var width = style.width;
            var height = style.height / 2 - 10;
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + height);
            ctx.moveTo(x + width, y);
            ctx.lineTo(x + width, y + height);
            ctx.moveTo(x, y + height / 2);
            if (!style.lineType || style.lineType == 'solid') {
                ctx.lineTo(x + width, y + height / 2);
            } else if (style.lineType == 'dashed' || style.lineType == 'dotted') {
                var dashLength = (style.lineWidth || 1) * (style.lineType == 'dashed' ? 5 : 1);
                dashedLineTo(ctx, x, y + height / 2, x + width, y + height / 2, dashLength);
            }
        },
        brushSymbol: function (ctx, style) {
            var y = style.y + style.height / 4;
            ctx.save();
            var chainPoint = style.chainPoint;
            var curPoint;
            for (var idx = 0, l = chainPoint.length; idx < l; idx++) {
                curPoint = chainPoint[idx];
                if (curPoint.symbol != 'none') {
                    ctx.beginPath();
                    var symbolSize = curPoint.symbolSize;
                    IconShape.prototype.buildPath(ctx, {
                        iconType: curPoint.symbol,
                        x: curPoint.x - symbolSize,
                        y: y - symbolSize,
                        width: symbolSize * 2,
                        height: symbolSize * 2,
                        n: curPoint.n
                    });
                    ctx.fillStyle = curPoint.isEmpty ? '#fff' : style.strokeColor;
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                }
                if (curPoint.showLabel) {
                    ctx.font = curPoint.textFont;
                    ctx.fillStyle = curPoint.textColor;
                    ctx.textAlign = curPoint.textAlign;
                    ctx.textBaseline = curPoint.textBaseline;
                    if (curPoint.rotation) {
                        ctx.save();
                        this._updateTextTransform(ctx, curPoint.rotation);
                        ctx.fillText(curPoint.name, curPoint.textX, curPoint.textY);
                        ctx.restore();
                    } else {
                        ctx.fillText(curPoint.name, curPoint.textX, curPoint.textY);
                    }
                }
            }
            ctx.restore();
        },
        _updateTextTransform: function (ctx, rotation) {
            var _transform = matrix.create();
            matrix.identity(_transform);
            if (rotation[0] !== 0) {
                var originX = rotation[1] || 0;
                var originY = rotation[2] || 0;
                if (originX || originY) {
                    matrix.translate(_transform, _transform, [
                        -originX,
                        -originY
                    ]);
                }
                matrix.rotate(_transform, _transform, rotation[0]);
                if (originX || originY) {
                    matrix.translate(_transform, _transform, [
                        originX,
                        originY
                    ]);
                }
            }
            ctx.transform.apply(ctx, _transform);
        },
        isCover: function (x, y) {
            var rect = this.style;
            if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
                return true;
            } else {
                return false;
            }
        }
    };
    zrUtil.inherits(Chain, Base);
    return Chain;
});define('zrender/shape/Ring', [
    'require',
    './Base',
    '../tool/util'
], function (require) {
    var Base = require('./Base');
    var Ring = function (options) {
        Base.call(this, options);
    };
    Ring.prototype = {
        type: 'ring',
        buildPath: function (ctx, style) {
            ctx.arc(style.x, style.y, style.r, 0, Math.PI * 2, false);
            ctx.moveTo(style.x + style.r0, style.y);
            ctx.arc(style.x, style.y, style.r0, 0, Math.PI * 2, true);
            return;
        },
        getRect: function (style) {
            if (style.__rect) {
                return style.__rect;
            }
            var lineWidth;
            if (style.brushType == 'stroke' || style.brushType == 'fill') {
                lineWidth = style.lineWidth || 1;
            } else {
                lineWidth = 0;
            }
            style.__rect = {
                x: Math.round(style.x - style.r - lineWidth / 2),
                y: Math.round(style.y - style.r - lineWidth / 2),
                width: style.r * 2 + lineWidth,
                height: style.r * 2 + lineWidth
            };
            return style.__rect;
        }
    };
    require('../tool/util').inherits(Ring, Base);
    return Ring;
});define('echarts/data/Graph', [
    'require',
    'zrender/tool/util'
], function (require) {
    var util = require('zrender/tool/util');
    'use strict';
    var Graph = function (directed) {
        this._directed = directed || false;
        this.nodes = [];
        this.edges = [];
        this._nodesMap = {};
        this._edgesMap = {};
    };
    Graph.prototype.isDirected = function () {
        return this._directed;
    };
    Graph.prototype.addNode = function (id, data) {
        if (this._nodesMap[id]) {
            return this._nodesMap[id];
        }
        var node = new Graph.Node(id, data);
        this.nodes.push(node);
        this._nodesMap[id] = node;
        return node;
    };
    Graph.prototype.getNodeById = function (id) {
        return this._nodesMap[id];
    };
    Graph.prototype.addEdge = function (n1, n2, data) {
        if (typeof n1 == 'string') {
            n1 = this._nodesMap[n1];
        }
        if (typeof n2 == 'string') {
            n2 = this._nodesMap[n2];
        }
        if (!n1 || !n2) {
            return;
        }
        var key = n1.id + '-' + n2.id;
        if (this._edgesMap[key]) {
            return this._edgesMap[key];
        }
        var edge = new Graph.Edge(n1, n2, data);
        if (this._directed) {
            n1.outEdges.push(edge);
            n2.inEdges.push(edge);
        }
        n1.edges.push(edge);
        if (n1 !== n2) {
            n2.edges.push(edge);
        }
        this.edges.push(edge);
        this._edgesMap[key] = edge;
        return edge;
    };
    Graph.prototype.removeEdge = function (edge) {
        var n1 = edge.node1;
        var n2 = edge.node2;
        var key = n1.id + '-' + n2.id;
        if (this._directed) {
            n1.outEdges.splice(util.indexOf(n1.outEdges, edge), 1);
            n2.inEdges.splice(util.indexOf(n2.inEdges, edge), 1);
        }
        n1.edges.splice(util.indexOf(n1.edges, edge), 1);
        if (n1 !== n2) {
            n2.edges.splice(util.indexOf(n2.edges, edge), 1);
        }
        delete this._edgesMap[key];
        this.edges.splice(util.indexOf(this.edges, edge), 1);
    };
    Graph.prototype.getEdge = function (n1, n2) {
        if (typeof n1 !== 'string') {
            n1 = n1.id;
        }
        if (typeof n2 !== 'string') {
            n2 = n2.id;
        }
        if (this._directed) {
            return this._edgesMap[n1 + '-' + n2];
        } else {
            return this._edgesMap[n1 + '-' + n2] || this._edgesMap[n2 + '-' + n1];
        }
    };
    Graph.prototype.removeNode = function (node) {
        if (typeof node === 'string') {
            node = this._nodesMap[node];
            if (!node) {
                return;
            }
        }
        delete this._nodesMap[node.id];
        this.nodes.splice(util.indexOf(this.nodes, node), 1);
        for (var i = 0; i < this.edges.length;) {
            var edge = this.edges[i];
            if (edge.node1 === node || edge.node2 === node) {
                this.removeEdge(edge);
            } else {
                i++;
            }
        }
    };
    Graph.prototype.filterNode = function (cb, context) {
        var len = this.nodes.length;
        for (var i = 0; i < len;) {
            if (cb.call(context, this.nodes[i], i)) {
                i++;
            } else {
                this.removeNode(this.nodes[i]);
                len--;
            }
        }
    };
    Graph.prototype.filterEdge = function (cb, context) {
        var len = this.edges.length;
        for (var i = 0; i < len;) {
            if (cb.call(context, this.edges[i], i)) {
                i++;
            } else {
                this.removeEdge(this.edges[i]);
                len--;
            }
        }
    };
    Graph.prototype.eachNode = function (cb, context) {
        var len = this.nodes.length;
        for (var i = 0; i < len; i++) {
            if (this.nodes[i]) {
                cb.call(context, this.nodes[i], i);
            }
        }
    };
    Graph.prototype.eachEdge = function (cb, context) {
        var len = this.edges.length;
        for (var i = 0; i < len; i++) {
            if (this.edges[i]) {
                cb.call(context, this.edges[i], i);
            }
        }
    };
    Graph.prototype.clear = function () {
        this.nodes.length = 0;
        this.edges.length = 0;
        this._nodesMap = {};
        this._edgesMap = {};
    };
    Graph.prototype.breadthFirstTraverse = function (cb, startNode, direction, context) {
        if (typeof startNode === 'string') {
            startNode = this._nodesMap[startNode];
        }
        if (!startNode) {
            return;
        }
        var edgeType = 'edges';
        if (direction === 'out') {
            edgeType = 'outEdges';
        } else if (direction === 'in') {
            edgeType = 'inEdges';
        }
        for (var i = 0; i < this.nodes.length; i++) {
            this.nodes[i].__visited = false;
        }
        if (cb.call(context, startNode, null)) {
            return;
        }
        var queue = [startNode];
        while (queue.length) {
            var currentNode = queue.shift();
            var edges = currentNode[edgeType];
            for (var i = 0; i < edges.length; i++) {
                var e = edges[i];
                var otherNode = e.node1 === currentNode ? e.node2 : e.node1;
                if (!otherNode.__visited) {
                    if (cb.call(otherNode, otherNode, currentNode)) {
                        return;
                    }
                    queue.push(otherNode);
                    otherNode.__visited = true;
                }
            }
        }
    };
    Graph.prototype.clone = function () {
        var graph = new Graph(this._directed);
        for (var i = 0; i < this.nodes.length; i++) {
            graph.addNode(this.nodes[i].id, this.nodes[i].data);
        }
        for (var i = 0; i < this.edges.length; i++) {
            var e = this.edges[i];
            graph.addEdge(e.node1.id, e.node2.id, e.data);
        }
        return graph;
    };
    var Node = function (id, data) {
        this.id = id;
        this.data = data || null;
        this.inEdges = [];
        this.outEdges = [];
        this.edges = [];
    };
    Node.prototype.degree = function () {
        return this.edges.length;
    };
    Node.prototype.inDegree = function () {
        return this.inEdges.length;
    };
    Node.prototype.outDegree = function () {
        return this.outEdges.length;
    };
    var Edge = function (node1, node2, data) {
        this.node1 = node1;
        this.node2 = node2;
        this.data = data || null;
    };
    Graph.Node = Node;
    Graph.Edge = Edge;
    Graph.fromMatrix = function (nodesData, matrix, directed) {
        if (!matrix || !matrix.length || matrix[0].length !== matrix.length || nodesData.length !== matrix.length) {
            return;
        }
        var size = matrix.length;
        var graph = new Graph(directed);
        for (var i = 0; i < size; i++) {
            var node = graph.addNode(nodesData[i].id, nodesData[i]);
            node.data.value = 0;
            if (directed) {
                node.data.outValue = node.data.inValue = 0;
            }
        }
        for (var i = 0; i < size; i++) {
            for (var j = 0; j < size; j++) {
                var item = matrix[i][j];
                if (directed) {
                    graph.nodes[i].data.outValue += item;
                    graph.nodes[j].data.inValue += item;
                }
                graph.nodes[i].data.value += item;
                graph.nodes[j].data.value += item;
            }
        }
        for (var i = 0; i < size; i++) {
            for (var j = i; j < size; j++) {
                var item = matrix[i][j];
                if (item === 0) {
                    continue;
                }
                var n1 = graph.nodes[i];
                var n2 = graph.nodes[j];
                var edge = graph.addEdge(n1, n2, {});
                edge.data.weight = item;
                if (i !== j) {
                    if (directed && matrix[j][i]) {
                        var inEdge = graph.addEdge(n2, n1, {});
                        inEdge.data.weight = matrix[j][i];
                    }
                }
            }
        }
        return graph;
    };
    return Graph;
});define('echarts/chart/force', [
    'require',
    './base',
    '../data/Graph',
    '../layout/Force',
    'zrender/shape/Line',
    'zrender/shape/BezierCurve',
    'zrender/shape/Image',
    '../util/shape/Icon',
    '../config',
    '../util/ecData',
    'zrender/tool/util',
    'zrender/config',
    'zrender/tool/vector',
    '../chart'
], function (require) {
    'use strict';
    var ChartBase = require('./base');
    var Graph = require('../data/Graph');
    var ForceLayout = require('../layout/Force');
    var LineShape = require('zrender/shape/Line');
    var BezierCurveShape = require('zrender/shape/BezierCurve');
    var ImageShape = require('zrender/shape/Image');
    var IconShape = require('../util/shape/Icon');
    var ecConfig = require('../config');
    ecConfig.force = {
        zlevel: 1,
        z: 2,
        center: [
            '50%',
            '50%'
        ],
        size: '100%',
        preventOverlap: false,
        coolDown: 0.99,
        minRadius: 10,
        maxRadius: 20,
        ratioScaling: false,
        large: false,
        useWorker: false,
        steps: 1,
        scaling: 1,
        gravity: 1,
        symbol: 'circle',
        symbolSize: 0,
        linkSymbol: null,
        linkSymbolSize: [
            10,
            15
        ],
        draggable: true,
        clickable: true,
        roam: false,
        itemStyle: {
            normal: {
                label: {
                    show: false,
                    position: 'inside'
                },
                nodeStyle: {
                    brushType: 'both',
                    borderColor: '#5182ab',
                    borderWidth: 1
                },
                linkStyle: {
                    color: '#5182ab',
                    width: 1,
                    type: 'line'
                }
            },
            emphasis: {
                label: { show: false },
                nodeStyle: {},
                linkStyle: { opacity: 0 }
            }
        }
    };
    var ecData = require('../util/ecData');
    var zrUtil = require('zrender/tool/util');
    var zrConfig = require('zrender/config');
    var vec2 = require('zrender/tool/vector');
    function Force(ecTheme, messageCenter, zr, option, myChart) {
        var self = this;
        ChartBase.call(this, ecTheme, messageCenter, zr, option, myChart);
        this.__nodePositionMap = {};
        this._graph = new Graph(true);
        this._layout = new ForceLayout();
        this._layout.onupdate = function () {
            self._step();
        };
        this._steps = 1;
        this.ondragstart = function () {
            ondragstart.apply(self, arguments);
        };
        this.ondragend = function () {
            ondragend.apply(self, arguments);
        };
        this.ondrop = function () {
        };
        this.shapeHandler.ondragstart = function () {
            self.isDragstart = true;
        };
        this.onmousemove = function () {
            onmousemove.apply(self, arguments);
        };
        this.refresh(option);
    }
    Force.prototype = {
        constructor: Force,
        type: ecConfig.CHART_TYPE_FORCE,
        _init: function () {
            var legend = this.component.legend;
            var series = this.series;
            var serieName;
            this.clear();
            for (var i = 0, l = series.length; i < l; i++) {
                var serie = series[i];
                if (serie.type === ecConfig.CHART_TYPE_FORCE) {
                    series[i] = this.reformOption(series[i]);
                    serieName = series[i].name || '';
                    this.selectedMap[serieName] = legend ? legend.isSelected(serieName) : true;
                    if (!this.selectedMap[serieName]) {
                        continue;
                    }
                    this._initSerie(serie, i);
                    break;
                }
            }
        },
        _getNodeCategory: function (serie, node) {
            return serie.categories && serie.categories[node.category || 0];
        },
        _getNodeQueryTarget: function (serie, node, type) {
            type = type || 'normal';
            var category = this._getNodeCategory(serie, node) || {};
            return [
                node.itemStyle && node.itemStyle[type],
                category && category.itemStyle && category.itemStyle[type],
                serie.itemStyle[type].nodeStyle
            ];
        },
        _getEdgeQueryTarget: function (serie, edge, type) {
            type = type || 'normal';
            return [
                edge.itemStyle && edge.itemStyle[type],
                serie.itemStyle[type].linkStyle
            ];
        },
        _initSerie: function (serie, serieIdx) {
            this._temperature = 1;
            if (serie.data) {
                this._graph = this._getSerieGraphFromDataMatrix(serie);
            } else {
                this._graph = this._getSerieGraphFromNodeLinks(serie);
            }
            this._buildLinkShapes(serie, serieIdx);
            this._buildNodeShapes(serie, serieIdx);
            var panable = serie.roam === true || serie.roam === 'move';
            var zoomable = serie.roam === true || serie.roam === 'scale';
            this.zr.modLayer(this.getZlevelBase(), {
                panable: panable,
                zoomable: zoomable
            });
            if (this.query('markPoint.effect.show') || this.query('markLine.effect.show')) {
                this.zr.modLayer(ecConfig.EFFECT_ZLEVEL, {
                    panable: panable,
                    zoomable: zoomable
                });
            }
            this._initLayout(serie);
            this._step();
        },
        _getSerieGraphFromDataMatrix: function (serie) {
            var nodesData = [];
            var count = 0;
            var matrix = [];
            for (var i = 0; i < serie.matrix.length; i++) {
                matrix[i] = serie.matrix[i].slice();
            }
            var data = serie.data || serie.nodes;
            for (var i = 0; i < data.length; i++) {
                var node = {};
                var group = data[i];
                for (var key in group) {
                    if (key === 'name') {
                        node['id'] = group['name'];
                    } else {
                        node[key] = group[key];
                    }
                }
                var category = this._getNodeCategory(serie, group);
                var name = category ? category.name : group.name;
                this.selectedMap[name] = this.isSelected(name);
                if (this.selectedMap[name]) {
                    nodesData.push(node);
                    count++;
                } else {
                    matrix.splice(count, 1);
                    for (var j = 0; j < matrix.length; j++) {
                        matrix[j].splice(count, 1);
                    }
                }
            }
            var graph = Graph.fromMatrix(nodesData, matrix, true);
            graph.eachNode(function (n, idx) {
                n.layout = {
                    size: n.data.value,
                    mass: 0
                };
                n.rawIndex = idx;
            });
            graph.eachEdge(function (e) {
                e.layout = { weight: e.data.weight };
            });
            return graph;
        },
        _getSerieGraphFromNodeLinks: function (serie) {
            var graph = new Graph(true);
            var nodes = serie.data || serie.nodes;
            var num = nodes.length;
            for (var i = 0, len = nodes.length; i < len; i++) {
                var n = nodes[i];
                if (!n || n.ignore) {
                    num--;
                    continue;
                }
                var category = this._getNodeCategory(serie, n);
                var name = category ? category.name : n.name;
                this.selectedMap[name] = this.isSelected(name);
                if (this.selectedMap[name]) {
                    var node = graph.addNode(n.name, n);
                    node.rawIndex = i;
                }
            }
            this.elementsLength = this.zr.handler.elementsLength = num;
            this.zr.painter.noText = (num > 200);          // 点大于200时，不显示文字
            for (var i = 0, len = serie.links.length; i < len; i++) {
                var e = serie.links[i];
                var n1 = e.source;
                var n2 = e.target;
                if (typeof n1 === 'number') {
                    n1 = nodes[n1];
                    if (n1) {
                        n1 = n1.name;
                    }
                }
                if (typeof n2 === 'number') {
                    n2 = nodes[n2];
                    if (n2) {
                        n2 = n2.name;
                    }
                }
                var edge = graph.addEdge(n1, n2, e);
                if (edge) {
                    edge.rawIndex = i;
                }
            }
            graph.eachNode(function (n) {
                var value = n.data.value;
                if (value == null) {
                    value = 0;
                    for (var i = 0; i < n.edges.length; i++) {
                        value += n.edges[i].data.weight || 0;
                    }
                }
                n.layout = {
                    size: value,
                    mass: 0
                };
            });
            graph.eachEdge(function (e) {
                e.layout = { weight: e.data.weight == null ? 1 : e.data.weight };
            });
            return graph;
        },
        _initLayout: function (serie) {
            var graph = this._graph;
            var len = graph.nodes.length;
            var isLarge = this.elementsLength > 200 ? true : false;
            var minRadius = this.query(serie, 'minRadius');
            var maxRadius = this.query(serie, 'maxRadius');
            // this._steps = serie.steps || 1;
            this._steps = isLarge ? 7 : 1;   //modified by jswang
            var layout = this._layout;
            layout.center = this.parseCenter(this.zr, serie.center);
            layout.width = this.parsePercent(serie.size, this.zr.getWidth());
            layout.height = this.parsePercent(serie.size, this.zr.getHeight());
            // layout.large = serie.large;
            layout.large = isLarge;   //modified by jswang
            layout.scaling = serie.scaling;
            layout.ratioScaling = serie.ratioScaling;
            layout.gravity = serie.gravity;
            layout.temperature = 1;
            // layout.coolDown = serie.coolDown;
            layout.coolDown = isLarge ? 0.97 : 0.98;   //modified by jswang
            layout.barnesHutTheta = isLarge ? 0.8 : 1;   //added by jswang
            layout.preventNodeEdgeOverlap = serie.preventOverlap;
            layout.preventNodeOverlap = serie.preventOverlap;
            var min = Infinity;
            var max = -Infinity;
            for (var i = 0; i < len; i++) {
                var gNode = graph.nodes[i];
                max = Math.max(gNode.layout.size, max);
                min = Math.min(gNode.layout.size, min);
            }
            var divider = max - min;
            for (var i = 0; i < len; i++) {
                var gNode = graph.nodes[i];
                if (divider > 0) {
                    gNode.layout.size = (gNode.layout.size - min) * (maxRadius - minRadius) / divider + minRadius;
                    gNode.layout.mass = gNode.layout.size / maxRadius;
                } else {
                    gNode.layout.size = (maxRadius - minRadius) / 2;
                    gNode.layout.mass = 0.5;
                }
            }
            for (var i = 0; i < len; i++) {
                var gNode = graph.nodes[i];
                if (typeof this.__nodePositionMap[gNode.id] !== 'undefined') {
                    gNode.layout.position = vec2.create();
                    vec2.copy(gNode.layout.position, this.__nodePositionMap[gNode.id]);
                } else if (typeof gNode.data.initial !== 'undefined') {
                    gNode.layout.position = vec2.create();
                    vec2.copy(gNode.layout.position, gNode.data.initial);
                } else {
                    var center = this._layout.center;
                    var size = Math.min(this._layout.width, this._layout.height);
                    gNode.layout.position = _randomInSquare(center[0], center[1], size * 0.8);
                }
                var style = gNode.shape.style;
                var radius = gNode.layout.size;
                style.width = style.width || radius * 2;
                style.height = style.height || radius * 2;
                style.x = -style.width / 2;
                style.y = -style.height / 2;
                vec2.copy(gNode.shape.position, gNode.layout.position);
            }
            len = graph.edges.length;
            max = -Infinity;
            for (var i = 0; i < len; i++) {
                var e = graph.edges[i];
                if (e.layout.weight > max) {
                    max = e.layout.weight;
                }
            }
            for (var i = 0; i < len; i++) {
                var e = graph.edges[i];
                e.layout.weight /= max;
            }
            this._layout.init(graph, serie.useWorker);
        },
        _buildNodeShapes: function (serie, serieIdx) {
            var graph = this._graph;
            var categories = this.query(serie, 'categories');
            graph.eachNode(function (node) {
                var category = this._getNodeCategory(serie, node.data);
                var queryTarget = [
                    node.data,
                    category,
                    serie
                ];
                var styleQueryTarget = this._getNodeQueryTarget(serie, node.data);
                var emphasisStyleQueryTarget = this._getNodeQueryTarget(serie, node.data, 'emphasis');
                var shape = new IconShape({
                    style: {
                        x: 0,
                        y: 0,
                        color: this.deepQuery(styleQueryTarget, 'color'),
                        brushType: 'both',
                        strokeColor: this.deepQuery(styleQueryTarget, 'strokeColor') || this.deepQuery(styleQueryTarget, 'borderColor'),
                        lineWidth: this.deepQuery(styleQueryTarget, 'lineWidth') || this.deepQuery(styleQueryTarget, 'borderWidth')
                    },
                    highlightStyle: {
                        color: this.deepQuery(emphasisStyleQueryTarget, 'color'),
                        strokeColor: this.deepQuery(emphasisStyleQueryTarget, 'strokeColor') || this.deepQuery(emphasisStyleQueryTarget, 'borderColor'),
                        lineWidth: this.deepQuery(emphasisStyleQueryTarget, 'lineWidth') || this.deepQuery(emphasisStyleQueryTarget, 'borderWidth')
                    },
                    clickable: serie.clickable,
                    zlevel: this.getZlevelBase(),
                    // z: this.getZBase()
                    z: node.data.z || this.getZBase()
                });
                if (!shape.style.color) {
                    shape.style.color = category ? this.getColor(category.name) : this.getColor(node.id);
                }
                shape.style.iconType = this.deepQuery(queryTarget, 'symbol');
                var symbolSize = this.deepQuery(queryTarget, 'symbolSize') || 0;
                if (typeof symbolSize === 'number') {
                    symbolSize = [
                        symbolSize,
                        symbolSize
                    ];
                }
                shape.style.width = symbolSize[0] * 2;
                shape.style.height = symbolSize[1] * 2;
                if (shape.style.iconType.match('image')) {
                    shape.style.image = shape.style.iconType.replace(new RegExp('^image:\\/\\/'), '');
                    shape.style.isRoot = node.data.isRoot;      // added by jswang
                    shape = new ImageShape({
                        style: shape.style,
                        highlightStyle: shape.highlightStyle,
                        clickable: shape.clickable,
                        zlevel: this.getZlevelBase(),
                        // z: this.getZBase()
                        z: node.data.z || this.getZBase()
                    });
                }
                if (this.deepQuery(queryTarget, 'itemStyle.normal.label.show')) {
                    shape.style.text = node.data.label == null ? node.id : node.data.label;
                    shape.style.textPosition = this.deepQuery(queryTarget, 'itemStyle.normal.label.position');
                    shape.style.textColor = this.deepQuery(queryTarget, 'itemStyle.normal.label.textStyle.color');
                    shape.style.textFont = this.getFont(this.deepQuery(queryTarget, 'itemStyle.normal.label.textStyle') || {});
                }
                if (this.deepQuery(queryTarget, 'itemStyle.emphasis.label.show')) {
                    shape.highlightStyle.textPosition = this.deepQuery(queryTarget, 'itemStyle.emphasis.label.position');
                    shape.highlightStyle.textColor = this.deepQuery(queryTarget, 'itemStyle.emphasis.label.textStyle.color');
                    shape.highlightStyle.textFont = this.getFont(this.deepQuery(queryTarget, 'itemStyle.emphasis.label.textStyle') || {});
                }
                if (this.deepQuery(queryTarget, 'draggable')) {
                    this.setCalculable(shape);
                    shape.dragEnableTime = 0;
                    shape.draggable = true;
                    shape.ondragstart = this.shapeHandler.ondragstart;
                    shape.ondragover = null;
                }
                var categoryName = '';
                if (typeof node.category !== 'undefined') {
                    var category = categories[node.category];
                    categoryName = category && category.name || '';
                }
                ecData.pack(shape, serie, serieIdx, node.data, node.rawIndex, node.data.name || '', node.category);
                this.shapeList.push(shape);
                shape.hoverable = false; //取消节点的hover悬浮效果
                this.zr.addShape(shape);
                node.shape = shape;
            }, this);
        },
        _buildLinkShapes: function (serie, serieIdx) {
            var graph = this._graph;
            var len = graph.edges.length;
            for (var i = 0; i < len; i++) {
                var gEdge = graph.edges[i];
                var link = gEdge.data;
                var source = gEdge.node1;
                var target = gEdge.node2;
                var otherEdge = graph.getEdge(target, source);
                var queryTarget = this._getEdgeQueryTarget(serie, link);
                var linkType = this.deepQuery(queryTarget, 'type');
                if (serie.linkSymbol && serie.linkSymbol !== 'none') {
                    linkType = 'line';
                }
                var LinkShapeCtor = linkType === 'line' ? LineShape : BezierCurveShape;
                var linkShape = new LinkShapeCtor({
                    style: {
                        xStart: 0,
                        yStart: 0,
                        xEnd: 0,
                        yEnd: 0
                    },
                    clickable: this.query(serie, 'clickable'),
                    highlightStyle: {},
                    zlevel: this.getZlevelBase(),
                    // z: this.getZBase()
                    z: link.z || this.getZBase()
                });
                if (otherEdge && otherEdge.shape) {
                    linkShape.style.offset = 4;
                    otherEdge.shape.style.offset = 4;
                }
                zrUtil.merge(linkShape.style, this.query(serie, 'itemStyle.normal.linkStyle'), true);
                zrUtil.merge(linkShape.highlightStyle, this.query(serie, 'itemStyle.emphasis.linkStyle'), true);
                if (typeof link.itemStyle !== 'undefined') {
                    if (link.itemStyle.normal) {
                        zrUtil.merge(linkShape.style, link.itemStyle.normal, true);
                    }
                    if (link.itemStyle.emphasis) {
                        zrUtil.merge(linkShape.highlightStyle, link.itemStyle.emphasis, true);
                    }
                }
                linkShape.style.lineWidth = linkShape.style.lineWidth || linkShape.style.width;
                linkShape.style.strokeColor = linkShape.style.strokeColor || linkShape.style.color;
                linkShape.highlightStyle.lineWidth = linkShape.highlightStyle.lineWidth || linkShape.highlightStyle.width;
                linkShape.highlightStyle.strokeColor = linkShape.highlightStyle.strokeColor || linkShape.highlightStyle.color;
                ecData.pack(linkShape, serie, serieIdx, gEdge.data, gEdge.rawIndex == null ? i : gEdge.rawIndex, gEdge.data.name || source.id + ' - ' + target.id, source.id, target.id);
                this.shapeList.push(linkShape);
                this.zr.addShape(linkShape);
                gEdge.shape = linkShape;
                if (serie.linkSymbol && serie.linkSymbol !== 'none') {
                    var symbolShape = new IconShape({
                        style: {
                            x: -5,
                            y: 0,
                            width: serie.linkSymbolSize[0],
                            height: serie.linkSymbolSize[1],
                            iconType: serie.linkSymbol,
                            brushType: 'fill',
                            color: linkShape.style.strokeColor
                        },
                        highlightStyle: { brushType: 'fill' },
                        position: [
                            0,
                            0
                        ],
                        rotation: 0
                    });
                    linkShape._symbolShape = symbolShape;
                    this.shapeList.push(symbolShape);
                    this.zr.addShape(symbolShape);
                }
            }
        },
        _updateLinkShapes: function () {
            var v = vec2.create();
            var n = vec2.create();
            var p1 = vec2.create();
            var p2 = vec2.create();
            var edges = this._graph.edges;
            for (var i = 0, len = edges.length; i < len; i++) {
                var edge = edges[i];
                var data1 = edge.node1.data;
                var data2 = edge.node2.data;
                var sourceShape = edge.node1.shape;
                var targetShape = edge.node2.shape;
                vec2.copy(p1, sourceShape.position);
                vec2.copy(p2, targetShape.position);
                var edgeShapeStyle = edge.shape.style;
                vec2.sub(v, p1, p2);
                vec2.normalize(v, v);
                if (edgeShapeStyle.offset) {
                    n[0] = v[1];
                    n[1] = -v[0];
                    vec2.scaleAndAdd(p1, p1, n, edgeShapeStyle.offset);
                    vec2.scaleAndAdd(p2, p2, n, edgeShapeStyle.offset);
                } else if (edge.shape.type === 'bezier-curve') {
                    edgeShapeStyle.cpX1 = (p1[0] + p2[0]) / 2 - (p2[1] - p1[1]) / 4;
                    edgeShapeStyle.cpY1 = (p1[1] + p2[1]) / 2 - (p1[0] - p2[0]) / 4;
                }
                edgeShapeStyle.xStart = p1[0];
                edgeShapeStyle.yStart = p1[1];
                edgeShapeStyle.xEnd = p2[0];
                edgeShapeStyle.yEnd = p2[1];
                edge.shape.modSelf();
                if (edge.shape._symbolShape) {
                    var symbolShape = edge.shape._symbolShape;
                    vec2.copy(symbolShape.position, p2);
                    vec2.scaleAndAdd(symbolShape.position, symbolShape.position, v, targetShape.style.width / 2 + 2);
                    var angle = Math.atan2(v[1], v[0]);
                    symbolShape.rotation = Math.PI / 2 - angle;
                    symbolShape.modSelf();
                }
            }
        },
        _syncNodePositions: function () {
            var graph = this._graph;
            for (var i = 0; i < graph.nodes.length; i++) {
                var gNode = graph.nodes[i];
                var position = gNode.layout.position;
                var node = gNode.data;
                var shape = gNode.shape;
                var fixed = shape.fixed || node.fixed;
                if (fixed === true) {
                    fixed = 1;
                } else if (isNaN(fixed)) {
                    fixed = 0;
                }
                shape.position[0] += (position[0] - shape.position[0]) * (1 - fixed);
                shape.position[1] += (position[1] - shape.position[1]) * (1 - fixed);
                vec2.copy(position, shape.position);
                var nodeName = node.name;
                if (nodeName) {
                    var gPos = this.__nodePositionMap[nodeName];
                    if (!gPos) {
                        gPos = this.__nodePositionMap[nodeName] = vec2.create();
                    }
                    vec2.copy(gPos, position);
                }
                shape.modSelf();
            }
        },
        _step: function (e) {
            var fixed = this.fixed;

            this._syncNodePositions();
            this._updateLinkShapes();
            if(fixed !== true) {
                this.zr.refreshNextFrame();
            }
            /**
             * fixed 为 fasle的场景有：
             * 1、力导向图，初始化时，需要借助布局算法(此时fixed = undefined)
             * 2、新增点需要借助布局算法进行布局(此时fixed = undefined)
             * 3、设置fixed 为true 之后，手动改为 fixed = false
             *
             * fixed 为 true的场景有：
             * 3、布局结束后，拖动某个点(此时 fixed = true)
             *
             */
            if (this._layout.temperature > 0.02 && fixed !== true) {// mod by ddqian
                this._layout.step(this._steps);
            } else {
                this.zr.painter.noText = false;
                // this.zr.painter.refresh();
                this.messageCenter.dispatch(ecConfig.EVENT.FORCE_LAYOUT_END, {}, {}, this.myChart);
            }
        },
        refresh: function (newOption) {
            if (newOption) {
                this.option = newOption;
                this.series = this.option.series;
            }
            this.legend = this.component.legend;
            if (this.legend) {
                this.getColor = function (param) {
                    return this.legend.getColor(param);
                };
                this.isSelected = function (param) {
                    return this.legend.isSelected(param);
                };
            } else {
                var colorMap = {};
                var count = 0;
                this.getColor = function (key) {
                    if (colorMap[key]) {
                        return colorMap[key];
                    }
                    if (!colorMap[key]) {
                        colorMap[key] = this.zr.getColor(count++);
                    }
                    return colorMap[key];
                };
                this.isSelected = function () {
                    return true;
                };
            }
            this._init();
        },
        dispose: function () {
            this.clear();
            this.shapeList = null;
            this.effectList = null;
            this._layout.dispose();
            this._layout = null;
            this.__nodePositionMap = {};
        },
        getPosition: function () {
            var position = [];
            this._graph.eachNode(function (n) {
                if (n.layout) {
                    position.push({
                        name: n.data.name,
                        position: Array.prototype.slice.call(n.layout.position)
                    });
                }
            });
            return position;
        },
        pushHover: function (arr, shape) {
            arr.push(shape);
            shape.isPushed = true;
        }
    };
    function ondragstart(param) {
        if (!this.isDragstart || !param.target) {
            return;
        }
        var shape = param.target;
        /*modified by jswang begin*/
        //功能：获取节点拖拽时target的叶子节点和叶子连线，并保存到自定义的zrender.storage._hoveredShapes
        var nodes = this._graph.nodes;
        var that = this;
        var hoveredShapes = [];   //放到hover层的shape集合（用来分层渲染，实现性能提升）
        var targetNode = null;   //单点拖拽的目标node
        var multiTargets = [];    //多点拖拽的目标shape集合（需要计算位置变化）
        if(shape.type === 'image') {
            //单点拖拽
            this.dragBox && hoveredShapes.push(this.dragBox);
            for(var i = 0, l = nodes.length; i < l; i++){
                if(nodes[i].shape == shape) {
                    targetNode = nodes[i];
                    targetNode.edges.forEach(function(edge){
                        hoveredShapes.push(edge.shape);
                        hoveredShapes.push(edge.node1 == targetNode ? edge.node2.shape : edge.node1.shape);
                    })
                    break;
                }
            }
        } else if (shape.type === 'rectangle') {
            //多点拖拽(需提前设置目标节点node.data.dragging为true)
            for (var i = 0, l = nodes.length; i < l; i++) {
                var node = nodes[i];
                if(node.data.dragging) {
                    multiTargets.push(node.shape);
                    !node.shape.isPushed && that.pushHover(hoveredShapes, node.shape);
                    for (var _i = 0, _l = node.edges.length; _i < _l; _i++) {
                        var edge = node.edges[_i];
                        if(!edge.shape.isPushed) {
                            that.pushHover(hoveredShapes, edge.shape);
                            !edge.node1.shape.isPushed && that.pushHover(hoveredShapes, edge.node1.shape);
                            !edge.node2.shape.isPushed && that.pushHover(hoveredShapes, edge.node2.shape);
                        }
                    }
                }
            }
            hoveredShapes.forEach(function(shape) {
                shape.isPushed = false;
            });
        }
        this.zr.storage._hoveredShapes = hoveredShapes;
        this.zr.storage._multiTargets = multiTargets;
        /*modified by jswang end*/
        shape.fixed = true;
        this.isDragstart = false;
        this.zr.on(zrConfig.EVENT.MOUSEMOVE, this.onmousemove);
    }
    function onmousemove() {
        this._layout.temperature = 0.8;
        this._step();
    }
    function ondragend(param, status) {
        if (!this.isDragend || !param.target) {
            return;
        }
        var shape = param.target;
        shape.fixed = false;
        status.dragIn = true;
        status.needRefresh = false;
        this.isDragend = false;
        this.zr.un(zrConfig.EVENT.MOUSEMOVE, this.onmousemove);
    }
    function _randomInSquare(x, y, size) {
        var v = vec2.create();
        v[0] = (Math.random() - 0.5) * size + x;
        v[1] = (Math.random() - 0.5) * size + y;
        return v;
    }
    zrUtil.inherits(Force, ChartBase);
    require('../chart').define('force', Force);
    return Force;
});define('echarts/layout/Force', [
    'require',
    './forceLayoutWorker',
    'zrender/tool/vector'
], function (require) {
    var ForceLayoutWorker = require('./forceLayoutWorker');
    var vec2 = require('zrender/tool/vector');
    var requestAnimationFrame = window.requestAnimationFrame || window.msRequestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function (func) {
            setTimeout(func, 16);
        };
    var ArrayCtor = typeof Float32Array == 'undefined' ? Array : Float32Array;
    var workerUrl;
    function createWorkerUrl() {
        if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
            try {
                var blob = new Blob([ForceLayoutWorker.getWorkerCode()]);
                workerUrl = window.URL.createObjectURL(blob);
            } catch (e) {
                workerUrl = '';
            }
        }
        return workerUrl;
    }
    var ForceLayout = function (opts) {
        if (typeof workerUrl === 'undefined') {
            createWorkerUrl();
        }
        opts = opts || {};
        this.width = opts.width || 500;
        this.height = opts.height || 500;
        this.center = opts.center || [
                this.width / 2,
                this.height / 2
            ];
        this.ratioScaling = opts.ratioScaling || false;
        this.scaling = opts.scaling || 1;
        this.gravity = typeof opts.gravity !== 'undefined' ? opts.gravity : 1;
        this.large = opts.large || false;
        this.barnesHutTheta = opts.barnesHutTheta || 1.2;
        this.preventNodeOverlap = opts.preventNodeOverlap || false;
        this.preventNodeEdgeOverlap = opts.preventNodeEdgeOverlap || false;
        this.maxSpeedIncrease = opts.maxSpeedIncrease || 1;
        this.onupdate = opts.onupdate || function () {
            };
        this.temperature = opts.temperature || 1;
        this.coolDown = opts.coolDown || 0.99;
        this._layout = null;
        this._layoutWorker = null;
        var self = this;
        var _$onupdate = this._$onupdate;
        this._$onupdate = function (e) {
            _$onupdate.call(self, e);
        };
    };
    ForceLayout.prototype.updateConfig = function () {
        var width = this.width;
        var height = this.height;
        var size = Math.min(width, height);
        var config = {
            center: this.center,
            width: this.ratioScaling ? width : size,
            height: this.ratioScaling ? height : size,
            scaling: this.scaling || 1,
            gravity: this.gravity || 1,
            barnesHutOptimize: this.large,
            barnesHutTheta: this.barnesHutTheta,  //added by jswang
            preventNodeOverlap: this.preventNodeOverlap,
            preventNodeEdgeOverlap: this.preventNodeEdgeOverlap,
            maxSpeedIncrease: this.maxSpeedIncrease
        };
        if (this._layoutWorker) {
            this._layoutWorker.postMessage({
                cmd: 'updateConfig',
                config: config
            });
        } else {
            for (var name in config) {
                this._layout[name] = config[name];
            }
        }
    };
    ForceLayout.prototype.init = function (graph, useWorker) {
        if (this._layoutWorker) {
            this._layoutWorker.terminate();
            this._layoutWorker = null;
        }
        if (workerUrl && useWorker) {
            try {
                if (!this._layoutWorker) {
                    this._layoutWorker = new Worker(workerUrl);
                    this._layoutWorker.onmessage = this._$onupdate;
                }
                this._layout = null;
            } catch (e) {
                this._layoutWorker = null;
                if (!this._layout) {
                    this._layout = new ForceLayoutWorker();
                }
            }
        } else {
            if (!this._layout) {
                this._layout = new ForceLayoutWorker();
            }
        }
        this.temperature = 1;
        this.graph = graph;
        var len = graph.nodes.length;
        var positionArr = new ArrayCtor(len * 2);
        var massArr = new ArrayCtor(len);
        var sizeArr = new ArrayCtor(len);
        for (var i = 0; i < len; i++) {
            var n = graph.nodes[i];
            positionArr[i * 2] = n.layout.position[0];
            positionArr[i * 2 + 1] = n.layout.position[1];
            massArr[i] = typeof n.layout.mass === 'undefined' ? 1 : n.layout.mass;
            sizeArr[i] = typeof n.layout.size === 'undefined' ? 1 : n.layout.size;
            n.layout.__index = i;
        }
        len = graph.edges.length;
        var edgeArr = new ArrayCtor(len * 2);
        var edgeWeightArr = new ArrayCtor(len);
        for (var i = 0; i < len; i++) {
            var edge = graph.edges[i];
            edgeArr[i * 2] = edge.node1.layout.__index;
            edgeArr[i * 2 + 1] = edge.node2.layout.__index;
            edgeWeightArr[i] = edge.layout.weight || 1;
        }
        if (this._layoutWorker) {
            this._layoutWorker.postMessage({
                cmd: 'init',
                nodesPosition: positionArr,
                nodesMass: massArr,
                nodesSize: sizeArr,
                edges: edgeArr,
                edgesWeight: edgeWeightArr
            });
        } else {
            this._layout.initNodes(positionArr, massArr, sizeArr);
            this._layout.initEdges(edgeArr, edgeWeightArr);
        }
        this.updateConfig();
    };
    ForceLayout.prototype.step = function (steps) {
        var nodes = this.graph.nodes;
        if (this._layoutWorker) {
            var positionArr = new ArrayCtor(nodes.length * 2);
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                positionArr[i * 2] = n.layout.position[0];
                positionArr[i * 2 + 1] = n.layout.position[1];
            }
            this._layoutWorker.postMessage(positionArr.buffer, [positionArr.buffer]);
            this._layoutWorker.postMessage({
                cmd: 'update',
                steps: steps,
                temperature: this.temperature,
                coolDown: this.coolDown
            });
            for (var i = 0; i < steps; i++) {
                this.temperature *= this.coolDown;
            }
        } else {
            requestAnimationFrame(this._$onupdate);
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                vec2.copy(this._layout.nodes[i].position, n.layout.position);
            }
            for (var i = 0; i < steps; i++) {
                this._layout.temperature = this.temperature;
                this._layout.update();
                this.temperature *= this.coolDown;
            }
        }
    };
    ForceLayout.prototype._$onupdate = function (e) {
        if (this._layoutWorker) {
            var positionArr = new Float32Array(e.data);
            for (var i = 0; i < this.graph.nodes.length; i++) {
                var n = this.graph.nodes[i];
                n.layout.position[0] = positionArr[i * 2];
                n.layout.position[1] = positionArr[i * 2 + 1];
            }
            this.onupdate && this.onupdate();
        } else if (this._layout) {
            for (var i = 0; i < this.graph.nodes.length; i++) {
                var n = this.graph.nodes[i];
                vec2.copy(n.layout.position, this._layout.nodes[i].position);
            }
            this.onupdate && this.onupdate();
        }
    };
    ForceLayout.prototype.dispose = function () {
        if (this._layoutWorker) {
            this._layoutWorker.terminate();
        }
        this._layoutWorker = null;
        this._layout = null;
    };
    return ForceLayout;
});define('echarts/layout/forceLayoutWorker', [
    'require',
    'zrender/tool/vector'
], function __echartsForceLayoutWorker(require) {
    'use strict';
    var vec2;
    // var inWorker = typeof window === 'undefined' && typeof require === 'undefined';
    var inWorker = typeof window === 'undefined';
    if (inWorker) {
        vec2 = {
            create: function (x, y) {
                var out = new Float32Array(2);
                out[0] = x || 0;
                out[1] = y || 0;
                return out;
            },
            dist: function (a, b) {
                var x = b[0] - a[0];
                var y = b[1] - a[1];
                return Math.sqrt(x * x + y * y);
            },
            len: function (a) {
                var x = a[0];
                var y = a[1];
                return Math.sqrt(x * x + y * y);
            },
            scaleAndAdd: function (out, a, b, scale) {
                out[0] = a[0] + b[0] * scale;
                out[1] = a[1] + b[1] * scale;
                return out;
            },
            scale: function (out, a, b) {
                out[0] = a[0] * b;
                out[1] = a[1] * b;
                return out;
            },
            add: function (out, a, b) {
                out[0] = a[0] + b[0];
                out[1] = a[1] + b[1];
                return out;
            },
            sub: function (out, a, b) {
                out[0] = a[0] - b[0];
                out[1] = a[1] - b[1];
                return out;
            },
            dot: function (v1, v2) {
                return v1[0] * v2[0] + v1[1] * v2[1];
            },
            normalize: function (out, a) {
                var x = a[0];
                var y = a[1];
                var len = x * x + y * y;
                if (len > 0) {
                    len = 1 / Math.sqrt(len);
                    out[0] = a[0] * len;
                    out[1] = a[1] * len;
                }
                return out;
            },
            negate: function (out, a) {
                out[0] = -a[0];
                out[1] = -a[1];
                return out;
            },
            copy: function (out, a) {
                out[0] = a[0];
                out[1] = a[1];
                return out;
            },
            set: function (out, x, y) {
                out[0] = x;
                out[1] = y;
                return out;
            }
        };
    } else {
        vec2 = require('zrender/tool/vector');
    }
    var ArrayCtor = typeof Float32Array == 'undefined' ? Array : Float32Array;
    function Region() {
        this.subRegions = [];
        this.nSubRegions = 0;
        this.node = null;
        this.mass = 0;
        this.centerOfMass = null;
        this.bbox = new ArrayCtor(4);
        this.size = 0;
    }
    Region.prototype.beforeUpdate = function () {
        for (var i = 0; i < this.nSubRegions; i++) {
            this.subRegions[i].beforeUpdate();
        }
        this.mass = 0;
        if (this.centerOfMass) {
            this.centerOfMass[0] = 0;
            this.centerOfMass[1] = 0;
        }
        this.nSubRegions = 0;
        this.node = null;
    };
    Region.prototype.afterUpdate = function () {
        this.subRegions.length = this.nSubRegions;
        for (var i = 0; i < this.nSubRegions; i++) {
            this.subRegions[i].afterUpdate();
        }
    };
    Region.prototype.addNode = function (node) {
        if (this.nSubRegions === 0) {
            if (this.node == null) {
                this.node = node;
                return;
            } else {
                this._addNodeToSubRegion(this.node);
                this.node = null;
            }
        }
        this._addNodeToSubRegion(node);
        this._updateCenterOfMass(node);
    };
    Region.prototype.findSubRegion = function (x, y) {
        for (var i = 0; i < this.nSubRegions; i++) {
            var region = this.subRegions[i];
            if (region.contain(x, y)) {
                return region;
            }
        }
    };
    Region.prototype.contain = function (x, y) {
        return this.bbox[0] <= x && this.bbox[2] >= x && this.bbox[1] <= y && this.bbox[3] >= y;
    };
    Region.prototype.setBBox = function (minX, minY, maxX, maxY) {
        this.bbox[0] = minX;
        this.bbox[1] = minY;
        this.bbox[2] = maxX;
        this.bbox[3] = maxY;
        this.size = (maxX - minX + maxY - minY) / 2;
    };
    Region.prototype._newSubRegion = function () {
        var subRegion = this.subRegions[this.nSubRegions];
        if (!subRegion) {
            subRegion = new Region();
            this.subRegions[this.nSubRegions] = subRegion;
        }
        this.nSubRegions++;
        return subRegion;
    };
    Region.prototype._addNodeToSubRegion = function (node) {
        var subRegion = this.findSubRegion(node.position[0], node.position[1]);
        var bbox = this.bbox;
        if (!subRegion) {
            var cx = (bbox[0] + bbox[2]) / 2;
            var cy = (bbox[1] + bbox[3]) / 2;
            var w = (bbox[2] - bbox[0]) / 2;
            var h = (bbox[3] - bbox[1]) / 2;
            var xi = node.position[0] >= cx ? 1 : 0;
            var yi = node.position[1] >= cy ? 1 : 0;
            var subRegion = this._newSubRegion();
            subRegion.setBBox(xi * w + bbox[0], yi * h + bbox[1], (xi + 1) * w + bbox[0], (yi + 1) * h + bbox[1]);
        }
        subRegion.addNode(node);
    };
    Region.prototype._updateCenterOfMass = function (node) {
        if (this.centerOfMass == null) {
            this.centerOfMass = vec2.create();
        }
        var x = this.centerOfMass[0] * this.mass;
        var y = this.centerOfMass[1] * this.mass;
        x += node.position[0] * node.mass;
        y += node.position[1] * node.mass;
        this.mass += node.mass;
        this.centerOfMass[0] = x / this.mass;
        this.centerOfMass[1] = y / this.mass;
    };
    function GraphNode() {
        this.position = vec2.create();
        this.force = vec2.create();
        this.forcePrev = vec2.create();
        this.speed = vec2.create();
        this.speedPrev = vec2.create();
        this.mass = 1;
        this.inDegree = 0;
        this.outDegree = 0;
    }
    function GraphEdge(node1, node2) {
        this.node1 = node1;
        this.node2 = node2;
        this.weight = 1;
    }
    function ForceLayout() {
        this.barnesHutOptimize = false;
        this.barnesHutTheta = 1;   //modified by jswang ,原值1.5，调小后布局时间缩短，但精度降低
        this.repulsionByDegree = false;
        this.preventNodeOverlap = false;
        this.preventNodeEdgeOverlap = false;
        this.strongGravity = true;
        this.gravity = 1;
        this.scaling = 1;
        this.edgeWeightInfluence = 1;
        this.center = [
            0,
            0
        ];
        this.width = 500;
        this.height = 500;
        this.maxSpeedIncrease = 1;
        this.nodes = [];
        this.edges = [];
        this.bbox = new ArrayCtor(4);
        this._rootRegion = new Region();
        this._rootRegion.centerOfMass = vec2.create();
        this._massArr = null;
        this._k = 0;
    }
    ForceLayout.prototype.nodeToNodeRepulsionFactor = function (mass, d, k) {
        return k * k * mass / d;
    };
    ForceLayout.prototype.edgeToNodeRepulsionFactor = function (mass, d, k) {
        return k * mass / d;
    };
    ForceLayout.prototype.attractionFactor = function (w, d, k) {
        return w * d / k;
    };
    ForceLayout.prototype.initNodes = function (positionArr, massArr, sizeArr) {
        this.temperature = 1;
        var nNodes = positionArr.length / 2;
        this.nodes.length = 0;
        var haveSize = typeof sizeArr !== 'undefined';
        for (var i = 0; i < nNodes; i++) {
            var node = new GraphNode();
            node.position[0] = positionArr[i * 2];
            node.position[1] = positionArr[i * 2 + 1];
            node.mass = massArr[i];
            if (haveSize) {
                node.size = sizeArr[i];
            }
            this.nodes.push(node);
        }
        this._massArr = massArr;
        if (haveSize) {
            this._sizeArr = sizeArr;
        }
    };
    ForceLayout.prototype.initEdges = function (edgeArr, edgeWeightArr) {
        var nEdges = edgeArr.length / 2;
        this.edges.length = 0;
        var edgeHaveWeight = typeof edgeWeightArr !== 'undefined';
        for (var i = 0; i < nEdges; i++) {
            var sIdx = edgeArr[i * 2];
            var tIdx = edgeArr[i * 2 + 1];
            var sNode = this.nodes[sIdx];
            var tNode = this.nodes[tIdx];
            if (!sNode || !tNode) {
                continue;
            }
            sNode.outDegree++;
            tNode.inDegree++;
            var edge = new GraphEdge(sNode, tNode);
            if (edgeHaveWeight) {
                edge.weight = edgeWeightArr[i];
            }
            this.edges.push(edge);
        }
    };
    ForceLayout.prototype.update = function () {
        var nNodes = this.nodes.length;
        this.updateBBox();
        this._k = 0.4 * this.scaling * Math.sqrt(this.width * this.height / nNodes);
        if (this.barnesHutOptimize) {
            this._rootRegion.setBBox(this.bbox[0], this.bbox[1], this.bbox[2], this.bbox[3]);
            this._rootRegion.beforeUpdate();
            for (var i = 0; i < nNodes; i++) {
                this._rootRegion.addNode(this.nodes[i]);
            }
            this._rootRegion.afterUpdate();
        } else {
            var mass = 0;
            var centerOfMass = this._rootRegion.centerOfMass;
            vec2.set(centerOfMass, 0, 0);
            for (var i = 0; i < nNodes; i++) {
                var node = this.nodes[i];
                mass += node.mass;
                vec2.scaleAndAdd(centerOfMass, centerOfMass, node.position, node.mass);
            }
            if (mass > 0) {
                vec2.scale(centerOfMass, centerOfMass, 1 / mass);
            }
        }
        this.updateForce();
        this.updatePosition();
    };
    ForceLayout.prototype.updateForce = function () {
        var nNodes = this.nodes.length;
        for (var i = 0; i < nNodes; i++) {
            var node = this.nodes[i];
            vec2.copy(node.forcePrev, node.force);
            vec2.copy(node.speedPrev, node.speed);
            vec2.set(node.force, 0, 0);
        }
        this.updateNodeNodeForce();
        if (this.gravity > 0) {
            this.updateGravityForce();
        }
        this.updateEdgeForce();
        if (this.preventNodeEdgeOverlap) {
            this.updateNodeEdgeForce();
        }
    };
    ForceLayout.prototype.updatePosition = function () {
        var nNodes = this.nodes.length;
        var v = vec2.create();
        for (var i = 0; i < nNodes; i++) {
            var node = this.nodes[i];
            var speed = node.speed;
            vec2.scale(node.force, node.force, 1 / 30);
            var df = vec2.len(node.force) + 0.1;
            var scale = Math.min(df, 500) / df;
            vec2.scale(node.force, node.force, scale);
            vec2.add(speed, speed, node.force);
            vec2.scale(speed, speed, this.temperature);
            vec2.sub(v, speed, node.speedPrev);
            var swing = vec2.len(v);
            if (swing > 0) {
                vec2.scale(v, v, 1 / swing);
                var base = vec2.len(node.speedPrev);
                if (base > 0) {
                    swing = Math.min(swing / base, this.maxSpeedIncrease) * base;
                    vec2.scaleAndAdd(speed, node.speedPrev, v, swing);
                }
            }
            var ds = vec2.len(speed);
            var scale = Math.min(ds, 100) / (ds + 0.1);
            vec2.scale(speed, speed, scale);
            vec2.add(node.position, node.position, speed);
        }
    };
    ForceLayout.prototype.updateNodeNodeForce = function () {
        var nNodes = this.nodes.length;
        for (var i = 0; i < nNodes; i++) {
            var na = this.nodes[i];
            if (this.barnesHutOptimize) {
                this.applyRegionToNodeRepulsion(this._rootRegion, na);
            } else {
                for (var j = i + 1; j < nNodes; j++) {
                    var nb = this.nodes[j];
                    this.applyNodeToNodeRepulsion(na, nb, false);
                }
            }
        }
    };
    ForceLayout.prototype.updateGravityForce = function () {
        for (var i = 0; i < this.nodes.length; i++) {
            this.applyNodeGravity(this.nodes[i]);
        }
    };
    ForceLayout.prototype.updateEdgeForce = function () {
        for (var i = 0; i < this.edges.length; i++) {
            this.applyEdgeAttraction(this.edges[i]);
        }
    };
    ForceLayout.prototype.updateNodeEdgeForce = function () {
        for (var i = 0; i < this.nodes.length; i++) {
            for (var j = 0; j < this.edges.length; j++) {
                this.applyEdgeToNodeRepulsion(this.edges[j], this.nodes[i]);
            }
        }
    };
    ForceLayout.prototype.applyRegionToNodeRepulsion = function () {
        var v = vec2.create();
        return function applyRegionToNodeRepulsion(region, node) {
            if (region.node) {
                this.applyNodeToNodeRepulsion(region.node, node, true);
            } else {
                if (region.mass === 0 && node.mass === 0) {
                    return;
                }
                vec2.sub(v, node.position, region.centerOfMass);
                var d2 = v[0] * v[0] + v[1] * v[1];
                if (d2 > this.barnesHutTheta * region.size * region.size) {
                    var factor = this._k * this._k * (node.mass + region.mass) / (d2 + 1);
                    vec2.scaleAndAdd(node.force, node.force, v, factor * 2);
                } else {
                    for (var i = 0; i < region.nSubRegions; i++) {
                        this.applyRegionToNodeRepulsion(region.subRegions[i], node);
                    }
                }
            }
        };
    }();
    ForceLayout.prototype.applyNodeToNodeRepulsion = function () {
        var v = vec2.create();
        return function applyNodeToNodeRepulsion(na, nb, oneWay) {
            if (na === nb) {
                return;
            }
            if (na.mass === 0 && nb.mass === 0) {
                return;
            }
            vec2.sub(v, na.position, nb.position);
            var d2 = v[0] * v[0] + v[1] * v[1];
            if (d2 === 0) {
                return;
            }
            var factor;
            var mass = na.mass + nb.mass;
            var d = Math.sqrt(d2);
            vec2.scale(v, v, 1 / d);
            if (this.preventNodeOverlap) {
                d = d - na.size - nb.size;
                if (d > 0) {
                    factor = this.nodeToNodeRepulsionFactor(mass, d, this._k);
                } else if (d <= 0) {
                    factor = this._k * this._k * 10 * mass;
                }
            } else {
                factor = this.nodeToNodeRepulsionFactor(mass, d, this._k);
            }
            if (!oneWay) {
                vec2.scaleAndAdd(na.force, na.force, v, factor * 2);
            }
            vec2.scaleAndAdd(nb.force, nb.force, v, -factor * 2);
        };
    }();
    ForceLayout.prototype.applyEdgeAttraction = function () {
        var v = vec2.create();
        return function applyEdgeAttraction(edge) {
            var na = edge.node1;
            var nb = edge.node2;
            vec2.sub(v, na.position, nb.position);
            var d = vec2.len(v);
            var w;
            if (this.edgeWeightInfluence === 0) {
                w = 1;
            } else if (this.edgeWeightInfluence == 1) {
                w = edge.weight;
            } else {
                w = Math.pow(edge.weight, this.edgeWeightInfluence);
            }
            var factor;
            if (this.preventOverlap) {
                d = d - na.size - nb.size;
                if (d <= 0) {
                    return;
                }
            }
            var factor = this.attractionFactor(w, d, this._k);
            vec2.scaleAndAdd(na.force, na.force, v, -factor);
            vec2.scaleAndAdd(nb.force, nb.force, v, factor);
        };
    }();
    ForceLayout.prototype.applyNodeGravity = function () {
        var v = vec2.create();
        return function (node) {
            vec2.sub(v, this.center, node.position);
            if (this.width > this.height) {
                v[1] *= this.width / this.height;
            } else {
                v[0] *= this.height / this.width;
            }
            var d = vec2.len(v) / 100;
            if (this.strongGravity) {
                vec2.scaleAndAdd(node.force, node.force, v, d * this.gravity * node.mass);
            } else {
                vec2.scaleAndAdd(node.force, node.force, v, this.gravity * node.mass / (d + 1));
            }
        };
    }();
    ForceLayout.prototype.applyEdgeToNodeRepulsion = function () {
        var v12 = vec2.create();
        var v13 = vec2.create();
        var p = vec2.create();
        return function (e, n3) {
            var n1 = e.node1;
            var n2 = e.node2;
            if (n1 === n3 || n2 === n3) {
                return;
            }
            vec2.sub(v12, n2.position, n1.position);
            vec2.sub(v13, n3.position, n1.position);
            var len12 = vec2.len(v12);
            vec2.scale(v12, v12, 1 / len12);
            var len = vec2.dot(v12, v13);
            if (len < 0 || len > len12) {
                return;
            }
            vec2.scaleAndAdd(p, n1.position, v12, len);
            var dist = vec2.dist(p, n3.position) - n3.size;
            var factor = this.edgeToNodeRepulsionFactor(n3.mass, Math.max(dist, 0.1), 100);
            vec2.sub(v12, n3.position, p);
            vec2.normalize(v12, v12);
            vec2.scaleAndAdd(n3.force, n3.force, v12, factor);
            vec2.scaleAndAdd(n1.force, n1.force, v12, -factor);
            vec2.scaleAndAdd(n2.force, n2.force, v12, -factor);
        };
    }();
    ForceLayout.prototype.updateBBox = function () {
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;
        for (var i = 0; i < this.nodes.length; i++) {
            var pos = this.nodes[i].position;
            minX = Math.min(minX, pos[0]);
            minY = Math.min(minY, pos[1]);
            maxX = Math.max(maxX, pos[0]);
            maxY = Math.max(maxY, pos[1]);
        }
        this.bbox[0] = minX;
        this.bbox[1] = minY;
        this.bbox[2] = maxX;
        this.bbox[3] = maxY;
    };
    ForceLayout.getWorkerCode = function () {
        var str = __echartsForceLayoutWorker.toString();
        return str.slice(str.indexOf('{') + 1, str.lastIndexOf('return'));
    };
    if (inWorker) {
        var forceLayout = null;
        self.onmessage = function (e) {
            if (e.data instanceof ArrayBuffer) {
                if (!forceLayout)
                    return;
                var positionArr = new Float32Array(e.data);
                var nNodes = positionArr.length / 2;
                for (var i = 0; i < nNodes; i++) {
                    var node = forceLayout.nodes[i];
                    node.position[0] = positionArr[i * 2];
                    node.position[1] = positionArr[i * 2 + 1];
                }
                return;
            }
            switch (e.data.cmd) {
                case 'init':
                    if (!forceLayout) {
                        forceLayout = new ForceLayout();
                    }
                    forceLayout.initNodes(e.data.nodesPosition, e.data.nodesMass, e.data.nodesSize);
                    forceLayout.initEdges(e.data.edges, e.data.edgesWeight);
                    break;
                case 'updateConfig':
                    if (forceLayout) {
                        for (var name in e.data.config) {
                            forceLayout[name] = e.data.config[name];
                        }
                    }
                    break;
                case 'update':
                    var steps = e.data.steps;
                    if (forceLayout) {
                        var nNodes = forceLayout.nodes.length;
                        var positionArr = new Float32Array(nNodes * 2);
                        forceLayout.temperature = e.data.temperature;
                        for (var i = 0; i < steps; i++) {
                            forceLayout.update();
                            forceLayout.temperature *= e.data.coolDown;
                        }
                        for (var i = 0; i < nNodes; i++) {
                            var node = forceLayout.nodes[i];
                            positionArr[i * 2] = node.position[0];
                            positionArr[i * 2 + 1] = node.position[1];
                        }
                        self.postMessage(positionArr.buffer, [positionArr.buffer]);
                    } else {
                        var emptyArr = new Float32Array();
                        self.postMessage(emptyArr.buffer, [emptyArr.buffer]);
                    }
                    break;
            }
        };
    }
    return ForceLayout;
});
require("echarts/chart/force");

var echarts = require('echarts');
var config = require('echarts/config');
var Rectangle = require('zrender/shape/Rectangle');


export {echarts, config, Rectangle};
