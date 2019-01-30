
const data = {
    "result": [  // 会直接展示在页面
        {
            "endNode": {
                "type": "phone",
                "name": '00000001'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },

            "startNode": {
                "type": "terminal",
                "name": "TERMINAL-365"
            }
        },{
            "endNode": {
                "type": "phone",
                "name": '00000001'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },
            "sLineAttribute": {
                "mc": "17:45:53",
                "num": 1,
            },
            "startNode": {
                "type": "terminal",
                "name": "TERMINAL-111"
            }
        },{
            "endNode": {
                "type": "phone",
                "name": '00000001'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },
            "sLineAttribute": {
                "mc": "17:45:53",
                "num": 1,
            },
            "startNode": {
                "type": "terminal",
                "name": "TERMINAL-2"
            }
        },{
            "endNode": {
                "type": "terminal",
                "name": 'TERMINAL-2'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },
            "sLineAttribute": {
                "mc": "17:45:53",
                "num": 1,
            },
            "startNode": {
                "type": "phone",
                "name": "111"
            }
        },{
            "endNode": {
                "type": "terminal",
                "name": 'TERMINAL-66'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },
            "sLineAttribute": {
                "mc": "17:45:53",
                "num": 1,
            },
            "startNode": {
                "type": "phone",
                "name": "111"
            }
        },{
            "endNode": {
                "type": "phone",
                "name": '123123'
            },
            "fLineAttribute": {
                "mc": "17:45:53",
                "num": 1
            },

            "startNode": {
                "type": "terminal",
                "name": "TERMINAL-365"
            }
        }
    ],
    "leafLine": []   // 叶子节点的数据，默认为收起状态
};
let num = 1000;
for (let i = 0; i < 200; i++) {
    num++;
    data.leafLine.push({
        "endNode": {
            "type": "phone",
            "name": num.toString()
        },
        "fLineAttribute": {
            "mc": "17:45:53",
            "num": 1,
        },
        "sLineAttribute": {
            "mc": "17:45:53",
            "num": 1,
        },
        "startNode": {
            "type": "terminal",
            "name": "TERMINAL-111"
        }
    });
    data.leafLine.push({
        "endNode": {
            "type": "phone",
            "name": num.toString() + '0'
        },
        "fLineAttribute": {
            "mc": "17:45:53",
            "num": 1,
        },
        "sLineAttribute": {
            "mc": "17:45:53",
            "num": 1,
        },
        "startNode": {
            "type": "terminal",
            "name": "TERMINAL-2"
        }
    })
}