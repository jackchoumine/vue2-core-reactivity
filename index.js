/*
 * @Description :
 * @Date        : 2022-07-17 19:47:21 +0800
 * @Author      : JackChou
 * @LastEditTime: 2022-07-17 19:49:31 +0800
 * @LastEditors : JackChou
 */
function MyVue(options = {}) {
  this.$options = options
  const data = (this._data = options.data ?? {})

  observe(data)

  Object.keys(data).forEach(key => {
    //NOTE 重新定义 this，实现 this 代理 this._data
    Object.defineProperty(this, key, {
      enumerable: true,
      get() {
        return this._data[key]
      },
      set(newValue) {
        this._data[key] = newValue
      },
    })
  })

  observe(data)
  initComputed.call(this)

  initMethods.call(this)

  new Compile(options.el, this)
}

function observe(dataObj) {
  if (typeof dataObj !== 'object') {
    // NOTE 监听对象上的属性
    return //dataObj
  }
  return new Observe(dataObj)
}

function Observe(data) {
  const dep = new Dep()
  // NOTE 不能新增不存在的属性，因为不存在 get 和 set
  Object.keys(data).forEach(key => {
    let value = data[key]
    observe(value)
    Object.defineProperty(data, key, {
      enumerable: true,
      get() {
        // NOTE 订阅
        Dep.target && dep.addSub(Dep.target) // [watcher]
        return value
      },
      set(newValue) {
        if (newValue === value) {
          return
        }
        value = newValue
        // NOTE 这样写爆栈
        // data[key] = newValue

        // NOTE 监听 data.key = { key:'value'}
        // 实现深度监听
        observe(newValue)
        // 发布
        dep.notify()
      },
    })
  })
}

function Compile(el, vm) {
  vm.$el = document.querySelector(el)
  const compileElement = compileTemplate(vm)
  vm.$el.appendChild(compileElement)
}

function compileTemplate(vm) {
  const fragment = document.createDocumentFragment()
  while ((child = vm.$el.firstElementChild)) {
    fragment.appendChild(child)
  }
  bindValueToTemplate(fragment, vm)

  function bindValueToTemplate(fragment, vm) {
    if (!vm) {
      throw new Error('bindValueToTemplate 缺少 vm')
    }
    Array.from(fragment.childNodes).forEach(node => {
      const text = node.textContent
      const reg = /\{\{(.*)\}\}/g
      if (node.nodeType === 1) {
        const nodeAttrs = Array.from(node.attributes)
        nodeAttrs.forEach(attr => {
          const { name, value: prop } = attr
          if (name.indexOf('@') === 0) {
            const eventName = name.substring(1)
            let handleName = prop.substring(0, prop.indexOf('('))
            let params = prop.substring(prop.indexOf('(') + 1, prop.indexOf(')')).split(',')
            if (!prop.includes('(')) {
              handleName = prop
              params = []
            }
            // 处理箭头函数绑定
            if (prop.includes('=>')) {
              if (prop.includes('{')) {
                const body = prop.substring(prop.indexOf('{') + 1, prop.indexOf('}'))
                node.addEventListener(eventName, event => {
                  const handler = new Function('event', body)
                  handler(event)
                })
                return
              } else {
                const body = prop.split('=>')[1]
                node.addEventListener(eventName, event => {
                  const handler = new Function('event', body)
                  handler(event)
                })
                return
              }
            }
            // 不能直接绑定函数，需要处理 this
            // node.addEventListener(eventName, vm[prop])
            node.addEventListener(eventName, event => {
              const _params = params.map(item => {
                const { data, computed } = vm.$options
                const value = isDataKey(data, item)
                  ? vm[item]
                  : isComputed(computed, item)
                  ? typeof computed[item] === 'function'
                    ? computed[item].call(vm) // 处理 this
                    : computed[item].get.call(vm) // 处理 this
                  : !Number.isNaN(+item)
                  ? +item
                  : item
                return value
              })
              // NOTE 拿不到 arguments
              // console.log(vm[handleName].arguments)
              if (_params.length) {
                vm[handleName](..._params)
              } else {
                // console.log(handleName)
                vm[handleName](event)
              }
            })
          }
        })
        if (reg.test(text)) {
          let val = vm
          // NOTE 关键 处理了 a.b
          const propAttrs = RegExp.$1.split('.')
          propAttrs.forEach(key => {
            val = val[key]
          })
          const updateText = val => {
            node.textContent = text.replace(reg, val)
          }
          updateText(val)
          new Watcher(vm, propAttrs, updateText)
        } else if (!text) {
          // 处理 v-model
          const nodeAttrs = Array.from(node.attributes)
          nodeAttrs.forEach(attr => {
            const { name, value: prop } = attr
            if (name.indexOf('v-') === 0) {
              // NOTE 处理 v-mode="a.b"
              let val = vm
              const propAttrs = prop.split('.')
              propAttrs.forEach(key => {
                val = val[key]
              })
              node.value = val
              // 监听属性更改
              new Watcher(vm, propAttrs, updatedValue => {
                // NOTE 修改属性时自动更新 input 的 value
                node.value = updatedValue
              })

              node.addEventListener('input', function (event) {
                const value = event.target.value
                // NOTE 处理 v-mode="a.b"
                let currentValue = vm
                let lastProp = propAttrs[0]
                propAttrs.forEach((key, index) => {
                  if (index <= propAttrs.length - 1) {
                    lastProp = key
                    if (index <= propAttrs.length - 2) {
                      currentValue = currentValue[key]
                    }
                  }
                })
                currentValue[lastProp] = value
              })
            }
          })
        }
      }
      if (node.childNodes) {
        bindValueToTemplate(node, vm)
      }
    })
  }
  return fragment
}

function initComputed() {
  const vm = this
  const { computed } = vm.$options ?? {}
  Object.keys(computed).forEach(key => {
    Object.defineProperty(vm, key, {
      get: typeof computed[key] === 'function' ? computed[key] : computed[key].get,
      set: computed[key] === 'function' ? computed[key] : computed[key].set,
    })
  })
}

function initMethods() {
  const vm = this
  const { methods = {} } = vm.$options
  Object.keys(methods).forEach(key => {
    vm[key] = methods[key]
  })
}

function Dep() {
  this.subs = []
}
// 订阅
Dep.prototype.addSub = function (sub) {
  this.subs.push(sub)
}

// 发布
Dep.prototype.notify = function () {
  this.subs.forEach(sub => {
    sub.update()
  })
}

// 监听对象
function Watcher(vm, propAttrs, fn) {
  this.fn = fn
  this.vm = vm
  this.propAttrs = propAttrs
  // TODO 为何这样写
  Dep.target = this
  let val = vm
  propAttrs.forEach(key => {
    val = val[key]
  })
  Dep.target = null
}

Watcher.prototype.getUpdatedValue = function () {
  let value = this.vm
  this.propAttrs.forEach(key => {
    value = value[key]
  })
  return value
}

Watcher.prototype.update = function () {
  this.fn(this.getUpdatedValue())
}

function isDataKey(data, key) {
  if (!key) return false
  return Object.keys(data).includes(key)
}
function isComputed(computed, key) {
  if (!key) return false
  return Object.keys(computed).includes(key)
}
