## slider-mod-card
### A homeassistant customizable card with a slider
### 一个为Homeassistant Dashboard设计的自定义卡片
### 提供了一个可自定义的滑块和滑动条，可用于输入输出为数值类型的实体的同步显示与控制
#### 例如：亮度、色温、温度、湿度、风速、档位等等数值范围实体
#### 此项目全部功能实现代码由AI生成 Power By ChatGPT
---
### 预览：
![](https://github.com/gasment/slider-mod-card/blob/main/preview.webp)
### 安装
hacs自动安装
- 复制github库地址：https://github.com/gasment/slider-mod-card
- 进入HACS，右上角进入自定义库Custom repositories，Repository库地址填写上面的github地址
- type类型选择dashboard仪表盘，点击添加
- 然后搜索slider-mod-card，下载安装，刷新页面
### 卡片配置：
1. 卡片调用(固定)
    ```
    type: custom:slider-mod-card
    ```
2. icon，滑块图标，支持内置mdi图标，或文件路径
    ```
    icon: /local/ui_v3/apng_webp_icon/control_card/ac/slider.svg
      #或
    icon: mdi:xxxxx
    ```
3. name，显示文本，支持字符串，或js模板返回
    ```
    show_name: true/false
    name: test
       #或
    name: |
        [[[
            var value = states[`entity_id`].state;
            return value
        ]]]
    
    ```
4. sync_value，滑动条和滑块需要同步的数据，支持数值或js模板返回，注意返回值需为数值，非字符串
    ```
    sync_value: 999
        #或
    sync_value: |
        [[[
            var value = states[`climate.211106241774699_climate`].attributes.target_temperature;
            return value
        ]]]
    ```
5. value_range_min/value_range_max/value_range_step，设定滑动范围的最小值、最大值、步进
    ```
    value_range_min: 0
    value_range_max: 100
    value_range_step: 1
    ```
6. bar_left_color/bar_right_color，以滑块分界，左右进度条的颜色设置，支持js模板返回
    ```
    bar_left_color: deepskyblue
    bar_right_color: white
    ```
7. tap_action，调用homeassistant的action实体操作服务，参考原生卡片的互动选项写法，仅做data处的变量替换即可
    ```
    tap_action:
        action: perform-action
        perform_action: climate.set_temperature
        target:
            entity_id: climate.entity
        data:
            temperature: value_range  #仅此处替换为变量名value_range
    ```
8. styles，卡片元素的css样式设置，支持字段：card、tips、icon、slider
    - 8.1. styles => card，设置最外层的容器样式，eg.
        ```
        styles:
            card:
                - background: rgba(0,0,0,0)
                - box-shadow: none
                - margin-left: 15px
        ```
    - 8.2. styles => tips，设置滑动时出现的气泡提示样式，eg.
        ```
        styles:
            tips:
                - color: rgb(85,110,127)
                - background: rgb(223,239,248)
                - font-size: 22px
                - margin-top: 20px
        ```
    - 8.3.  styles => icon，设置滑块图标的样式，eg.
        ```
        styles:
            icon:
                - height: 30px
                - width: 30px
        ```
    - 8.4. styles => slider，设置滑动进度条的样式，eg.
        ```
        styles:
            slider:
                - height: 20px
                - border-radius: 30px
                - width: 245px
        ```
   - 8.5. styles => wrap，设置wrap容器的样式，eg.
        ```
        styles:
            wrap:
                - padding: 10px
        ```
### 完整配置示例
```
type: custom:slider-mod-card
icon: /local/xxxx.svg
show_name: false
value_range_min: 17
value_range_max: 30
value_range_step: 0.5
sync_value: |
    [[[
        var value = states[`climate.entity`].attributes.target_temperature;
        return value
    ]]]
bar_left_color: deepskyblue
bar_right_color: white
tap_action:
    action: perform-action
    perform_action: climate.set_temperature
    target:
        entity_id: climate.entity
    data:
        temperature: value_range
styles:
    card:
        - background: rgba(0,0,0,0)
        - box-shadow: none
        - margin-left: 15px
    tips:
        - color: rgb(85,110,127)
        - background: rgb(223,239,248)
        - font-size: 22px
        - margin-top: 20px
    icon:
        - height: 30px
        - width: 30px
    slider:
        - height: 20px
        - border-radius: 30px
        - width: 245px
```
