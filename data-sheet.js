window.DataSheet = (function () {
  const rules = []

  const update = function (nodes = [document.documentElement]) {
    for (const { selector, action } of rules) {
      const matched = []
      for (const node of nodes) {
        if (node instanceof window.HTMLElement) {
          if (node.matches(selector)) {
            matched.push(node)
          }
          for (const element of node.querySelectorAll(selector)) {
            matched.push(element)
          }
        }
      }
      for (const element of matched) {
        if (element.isConnected) {
          action(element)
        }
      }
    }
  }

  const FRAGMENT = Symbol('fragment')
  const INSTANCES = Symbol('instances')
  const ENTRY = Symbol('entry')
  const TEMPLATE = Symbol('template')
  const EVENTS = Symbol('events')

  const nullEntry = {
    key: -1,
    value: undefined
  }

  const getEntry = function (element) {
    const entry = element[ENTRY]
    if (entry === undefined) {
      if (element === document.documentElement) {
        return nullEntry
      } else {
        return getEntry(element.parentNode)
      }
    } else {
      return entry
    }
  }

  const getKey = function (element) {
    return getEntry(element).key
  }

  const getValue = function (element) {
    return getEntry(element).value
  }

  const dispatch = function (actions) {
    return function (element) {
      for (const action of actions) {
        action(element)
      }
    }
  }

  const factories = [
    {
      accept (name) {
        return name === 'if'
      },
      create (_, evaluator) {
        return function (element) {
          if (evaluator(element)) {
            const fragment = element[FRAGMENT]
            if (fragment !== undefined) {
              element.appendChild(fragment)
              element[FRAGMENT] = undefined
              const input = element.querySelector('[autofocus]')
              if (input !== null) {
                input.focus()
              }
            }
          } else {
            if (element[FRAGMENT] === undefined) {
              const fragment = document.createDocumentFragment()
              while (element.firstChild) {
                fragment.appendChild(element.firstChild)
              }
              element[FRAGMENT] = fragment
            }
          }
        }
      }
    },
    {
      accept (name) {
        return name === 'for'
      },
      updateInstances (instances, values, max) {
        for (let i = 0; i < max; i++) {
          const instance = instances[i]
          const entry = {
            key: i,
            value: values[i]
          }
          for (const node of instance) {
            if (node instanceof window.HTMLElement) {
              node[ENTRY] = entry
            }
          }
          update(instance)
        }
      },
      create (_, evaluator) {
        const factory = this
        return function (element) {
          let instances = element[INSTANCES]
          if (instances === undefined) {
            instances = []
            element[INSTANCES] = instances
          }
          let template = element[TEMPLATE]
          if (template === undefined) {
            template = []
            while (element.firstChild) {
              template.push(element.removeChild(element.firstChild))
            }
            element[TEMPLATE] = template
          }
          const values = evaluator(element)
          const a = instances.length
          const b = values.length
          if (a < b) {
            factory.updateInstances(instances, values, a)
            const fragment = document.createDocumentFragment()
            for (let i = a; i < b; i++) {
              const entry = {
                key: i,
                value: values[i]
              }
              const instance = []
              for (const node of template) {
                const copy = node.cloneNode(true)
                if (copy instanceof window.HTMLElement) {
                  copy[ENTRY] = entry
                }
                instance.push(copy)
                fragment.appendChild(copy)
              }
              instances.push(instance)
            }
            element.appendChild(fragment)
          } else {
            if (a > b) {
              for (const instance of instances.splice(b, a - b)) {
                for (const node of instance) {
                  element.removeChild(node)
                }
              }
            }
            factory.updateInstances(instances, values, b)
          }
        }
      }
    },
    {
      accept (name, value) {
        return name === 'value' && typeof value === 'object'
      },
      create (_, descriptor) {
        return function (element) {
          element.oninput = function (event) {
            descriptor.set(event.target.value, event)
            update()
          }
          element.value = descriptor.get(element)
        }
      }
    },
    {
      accept (name) {
        return name.substr(0, 2) === 'on'
      },
      create (name, callback) {
        return function (element) {
          element[name] = function (event) {
            const result = callback(event)
            if (result instanceof Promise) {
              result.then(function () {
                update()
              })
            } else {
              update()
            }
          }
        }
      }
    },
    {
      accept (name) {
        return name === 'text'
      },
      create (_, evaluator) {
        return function (element) {
          element.textContent = evaluator(element)
        }
      }
    },
    {
      accept (name) {
        return name === 'class'
      },
      create (_, evaluators) {
        const actions = []
        for (const name in evaluators) {
          const evaluator = evaluators[name]
          actions.push(function (element) {
            if (evaluator(element)) {
              element.classList.add(name)
            } else {
              element.classList.remove(name)
            }
          })
        }
        return dispatch(actions)
      }
    },
    {
      eventCounter: 0,
      accept (name) {
        return name === 'events'
      },
      create (_, callbacks) {
        const actions = []
        for (const type in callbacks) {
          const callback = callbacks[type]
          const eventId = ++this.eventCounter
          const proxy = function (event) {
            const result = callback(event)
            if (result instanceof Promise) {
              result.then(function () {
                update()
              })
            } else {
              update()
            }
          }
          const entry = { type, proxy }
          actions.push(function (element) {
            let events = element[EVENTS]
            if (events === undefined) {
              events = {}
              element[EVENTS] = events
            }
            if (!{}.hasOwnProperty.call(events, eventId)) {
              element.addEventListener(type, entry.proxy)
              events[eventId] = entry
            }
          })
        }
        return dispatch(actions)
      }
    },
    {
      accept (name) {
        return name === 'attributes'
      },
      create (_, evaluators) {
        const actions = []
        for (const name in evaluators) {
          const evaluator = evaluators[name]
          actions.push(function (element) {
            element.setAttribute(name, evaluator(element))
          })
        }
        return dispatch(actions)
      }
    },
    {
      accept (name) {
        return name === 'actions'
      },
      create (_, actions) {
        return dispatch(actions)
      }
    },
    {
      accept (name) {
        return name === 'style'
      },
      create (_, evaluators) {
        const actions = []
        for (const name in evaluators) {
          const evaluator = evaluators[name]
          actions.push(function (element) {
            element.style[name] = evaluator(element)
          })
        }
        return dispatch(actions)
      }
    },
    {
      accept () {
        return true
      },
      create (name, evaluator) {
        return function (element) {
          element[name] = evaluator(element)
        }
      }
    }
  ]

  const define = function (sheet) {
    for (const selector in sheet) {
      const properties = sheet[selector]
      const actions = []
      for (const name in properties) {
        const value = properties[name]
        for (const factory of factories) {
          if (factory.accept(name, value)) {
            actions.push(factory.create(name, value))
            break
          }
        }
      }
      rules.push({
        selector,
        action: dispatch(actions)
      })
    }
  }

  const cleanUp = function (node) {
    const events = node[EVENTS]
    if (events !== undefined) {
      for (const eventId in events) {
        const { type, proxy } = events[eventId]
        node.removeEventListener(type, proxy)
      }
      node[EVENTS] = undefined
    }
    if (node.src !== undefined) {
      URL.revokeObjectURL(node.src)
    }
    for (const child of node.childNodes) {
      cleanUp(child)
    }
  }

  window.addEventListener('DOMContentLoaded', function load () {
    window.removeEventListener('DOMContentLoaded', load)
    window.addEventListener('popstate', function () {
      update()
    })
    new window.MutationObserver(function (mutations) {
      const nodes = []
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          cleanUp(node)
        }
        nodes.push(...mutation.addedNodes)
      }
      update(nodes)
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    })
    update()
  })

  return {
    define,
    update,
    getEntry,
    getKey,
    getValue
  }
})()
