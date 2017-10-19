/* global MutationObserver */

import { defaultDomFilter, applyChangesFromDom, reflectChangesOnDom } from './utils.js'

import YArray from '../YArray.js'
import YXmlText from './YXmlText.js'

function domToYXml (parent, doms) {
  const types = []
  doms.forEach(d => {
    if (d.__yxml != null && d.__yxml !== false) {
      d.__yxml._unbindFromDom()
    }
    if (parent._domFilter(d, []) !== null) {
      let type
      if (d.nodeType === document.TEXT_NODE) {
        type = new YXmlText(d)
      } else if (d.nodeType === document.ELEMENT_NODE) {
        type = new YXmlFragment._YXmlElement(d, parent._domFilter)
      } else {
        throw new Error('Unsupported node!')
      }
      type.enableSmartScrolling(parent._scrollElement)
      types.push(type)
    } else {
      d.__yxml = false
    }
  })
  return types
}

export default class YXmlFragment extends YArray {
  constructor () {
    super()
    this._dom = null
    this._domFilter = defaultDomFilter
    this._domObserver = null
    // this function makes sure that either the
    // dom event is executed, or the yjs observer is executed
    var token = true
    this._mutualExclude = f => {
      if (token) {
        token = false
        try {
          f()
        } catch (e) {
          console.error(e)
        }
        this._domObserver.takeRecords()
        token = true
      }
    }
    // Apply Y.Xml events to dom
    this.observe(reflectChangesOnDom)
  }
  enableSmartScrolling (scrollElement) {
    this._scrollElement = scrollElement
    this.forEach(xml => {
      xml.enableSmartScrolling(scrollElement)
    })
  }
  setDomFilter (f) {
    this._domFilter = f
    this.forEach(xml => {
      xml.setDomFilter(f)
    })
  }
  _callObserver (parentSub) {
    let event
    if (parentSub !== null) {
      event = {
        type: 'attributeChanged',
        name: parentSub,
        value: this.getAttribute(parentSub),
        target: this
      }
    } else {
      event = {
        type: 'contentChanged',
        target: this
      }
    }
    this._eventHandler.callEventListeners(event)
  }
  toString () {
    return this.map(xml => xml.toString()).join('')
  }
  _unbindFromDom () {
    if (this._domObserver != null) {
      this._domObserver.disconnect()
      this._domObserver = null
    }
    if (this._dom != null) {
      this._dom.__yxml = null
      this._dom = null
    }
  }
  insertDomElementsAfter (prev, doms) {
    const types = domToYXml(this, doms)
    return this.insertAfter(prev, types)
  }
  insertDomElements (pos, doms) {
    const types = domToYXml(this, doms)
    this.insert(pos, types)
    return types.length
  }
  bindToDom (dom) {
    if (this._dom != null) {
      this._unbindFromDom()
    }
    if (dom.__yxml != null) {
      dom.__yxml._unbindFromDom()
    }
    if (MutationObserver == null) {
      throw new Error('Not able to bind to a DOM element, because MutationObserver is not available!')
    }
    dom.innerHTML = ''
    this.forEach(t => {
      dom.insertBefore(t.getDom(), null)
    })
    this._dom = dom
    dom.__yxml = this
    this._bindToDom(dom)
  }
  // binds to a dom element
  // Only call if dom and YXml are isomorph
  _bindToDom (dom) {
    this._domObserverListener = mutations => {
      this._mutualExclude(() => {
        let diffChildren = false
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes') {
            let name = mutation.attributeName
            // check if filter accepts attribute
            if (this._domFilter(this._dom, [name]).length > 0) {
              var val = mutation.target.getAttribute(name)
              if (this.getAttribute(name) !== val) {
                if (val == null) {
                  this.removeAttribute(name)
                } else {
                  this.setAttribute(name, val)
                }
              }
            }
          } else if (mutation.type === 'childList') {
            diffChildren = true
          }
        })
        if (diffChildren) {
          applyChangesFromDom(this)
        }
      })
    }
    this._domObserver = new MutationObserver(this._domObserverListener)
    const observeOptions = { childList: true }
    if (this instanceof YXmlFragment._YXmlElement) {
      observeOptions.attributes = true
    }
    this._domObserver.observe(dom, observeOptions)
    return dom
  }
  _beforeChange () {
    if (this._domObserver != null) {
      this._domObserverListener(this._domObserver.takeRecords())
    }
  }
}