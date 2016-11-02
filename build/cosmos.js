var Cosmos = function(props) {
  var component = Cosmos.getComponentByName(props.component);
  if (!component) {
    throw new Error('Invalid component: ' + props.component);
  }
  return component(_.clone(props));
};

// Enable Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  var React = require('react'),
      _ = require('underscore'),
      $ = require('jquery'),
      Play = require('play-js').Play;
  module.exports = Cosmos;
}

_.extend(Cosmos, {
  mixins: {},
  components: {},
  transitions: {},
  start: function(options) {
    return new this.Router(options);
  },
  render: function(props, container, callback) {
    var componentInstance = this(props);
    if (container) {
      return React.renderComponent(componentInstance, container, callback);
    } else {
      return React.renderComponentToString(componentInstance);
    }
  },
  getComponentByName: function(name) {
    return this.components[name];
  }
});

Cosmos.RouterHistory = function() {
  /**
   * Stores a history of previous Component states with a stateful index
   * pointing to a current position in this history. Similar to the native
   * pushState implementation, but with access to all previous states (that
   * can be updated at any time.) The states are also uniquely identified by
   * stringifying them. This allows reusing previous states and transitioning
   * between them, like going back to a previous state and just rendering it
   * instead of loading it again from scratch.
   *
   * See "push" method to understand how are state transitioned.
   */
};
_.extend(Cosmos.RouterHistory, {
  transitionTypes: {
    NOOP: 0,
    INITIAL: 1,
    NEW: 2,
    BACK: 3,
    FORWARD: 4
  },
  prototype: _.extend([], {
    _push: Array.prototype.push,
    push: function(historyEntry) {
      /**
       * Pushing a new entry into the history can unfold in more than one way.
       * The transitionTypes paint the big picture, but there's more to consider.
       * When the history already has more than one entry you can go both back in
       * time or Back to the Future™ by pushing the same props as either the prev
       * or the next direct-neighbour entry. If an entry is pushed that does not
       * match any of the surrounding neighbours of the current entry, it will
       * create a FORWARD transition and will erase any other previous future.
       *
       * Here's an example of a history entry object. It can have any other data
       * attached to it, besides the required props.
       *
       *   {
       *     props: {
       *       component: 'List',
       *       data: 'users.json'
       *     },
       *     metaData: {
       *       foo: 'bar'
       *     }
       *   }
       *
       * TODO: Implement max past limit, past history never gets removed
       */
      // We cache the stringified queryString for faster comparison between
      // entries
      historyEntry.queryString =
        Cosmos.serialize.getQueryStringFromProps(historyEntry.props);

      if (!this.length) {
        this.index = 0;
        this._push(historyEntry);
        return Cosmos.RouterHistory.transitionTypes.INITIAL;
      }
      var currentEntry = this[this.index],
          prevEntry = this[this.index - 1] || {},
          nextEntry = this[this.index + 1] || {};

      if (historyEntry.queryString == currentEntry.queryString) {
        // No transition is needed if we're trying to open the same configuration
        return Cosmos.RouterHistory.transitionTypes.NOOP;
      }
      if (historyEntry.queryString == prevEntry.queryString) {
        // We're going back
        this.index--;
        return Cosmos.RouterHistory.transitionTypes.BACK;
      }
      this.index++;
      if (historyEntry.queryString == nextEntry.queryString) {
        // We're going back in the future. The latest meta data is most
        // relevant in a forward transition, only the previous state is reused
        this._mergeEntryMataData(this[this.index], historyEntry);
        return Cosmos.RouterHistory.transitionTypes.FORWARD;
      }
      // We're starting a new point in the future
      this.splice(this.index, this.length - this.index);
      this._push(historyEntry);
      return Cosmos.RouterHistory.transitionTypes.NEW;
    },
    canReusePropsInHistory: function(props) {
      /**
       * Helper method for checking if a set of props will be reused from current
       * history or will create a new entry (NEW transition type.)
       */
      if (!this.length) {
        return false;
      }
      var queryString = Cosmos.serialize.getQueryStringFromProps(props),
          currentEntry = this[this.index],
          prevEntry = this[this.index - 1] || {},
          nextEntry = this[this.index + 1] || {};
      return queryString == currentEntry.queryString ||
             queryString == prevEntry.queryString ||
             queryString == nextEntry.queryString;
    },
    _mergeEntryMataData: function(targetEntry, sourceEntry) {
      for (var k in sourceEntry) {
        if (k != 'queryString' && k != 'props') {
          targetEntry[k] = sourceEntry[k];
        }
      }
    }
  })
});

Cosmos.Router = function(options) {
  // The Router defaults are dynamic values they must be read whenever an
  // instance is created, thus they are not embedded in the Class prototype
  this.options = _.extend({
    props: Cosmos.url.getParams(),
    container: document.body,
    transition: null
  }, options);
  // defaultsProps is not applied when props are missing, but when they are
  // empty (regardless if they come from options or the default Rotuer props)
  if (_.isEmpty(this.options.props) && this.options.defaultProps) {
    this.options.props = this.options.defaultProps;
  }
  this.container = this.options.container;
  this._onPopState = this._onPopState.bind(this);
  this._bindPopStateEvent();
  this._replaceInitialState(this.options.props);
  // The initial render is done when the Router is instantiated
  this._resetHistory();
  this._loadEntry({props: this.options.props});
};
_.extend(Cosmos.Router, {
  CONTAINER_CLASS: 'cosmos-component-container',
  prototype: {
    stop: function() {
      this._unbindPopStateEvent();
    },
    goTo: function(href, originBounds) {
      // Old-school refreshes are made when pushState isn't supported
      if (!Cosmos.url.isPushStateSupported()) {
        window.location = href;
        return;
      }
      var queryString = href.split('?').pop(),
          props = Cosmos.serialize.getPropsFromQueryString(queryString);
      // Calling pushState doesn't trigger the onpopstate event, so push state
      // events and programatic Router calls are individually handled
      // https://developer.mozilla.org/en-US/docs/Web/API/window.onpopstate
      this._pushHistoryState(props, href);
      this._loadEntry({
        props: props,
        originBounds: originBounds
      });
    },
    _bindPopStateEvent: function() {
      window.addEventListener('popstate', this._onPopState);
    },
    _unbindPopStateEvent: function() {
      window.removeEventListener('popstate', this._onPopState);
    },
    _onPopState: function(e) {
      // Chrome & Safari trigger an empty popState event initially, while Firefox
      // doesn't, we choose to ignore that event altogether
      if (!e.state) {
        return;
      }
      // e.state only stores the props of a RouterHistory entry. Storing other
      // meta data like originBounds would be pointless because we can't know
      // whether a BACK or FORWARD action triggered the event, once the browser
      // instance is refreshed and the RouterHistory instance is lost. Moreover,
      // seeing how we can't tell the transition type of a PopState browser
      // event, we keep resetting the entire history until encountering entries
      // that we already cached in the current RouterHistory instance.
      if (this.history.length && !this.history.canReusePropsInHistory(e.state)) {
        this._resetHistory();
      }
      this._loadEntry({props: e.state});
    },
    _replaceInitialState: function(props) {
      // The initial state must contain the history entry of the first loaded
      // Component for when the users go Back in the browser
      this._replaceHistoryState(props, window.location.href);
    },
    _resetHistory: function() {
      this.history = new Cosmos.RouterHistory();
      this._currentComponent = null;
      this._resetContainer();
    },
    _loadEntry: function(historyEntry) {
      // The history entry for the previous Component is updated with its lastest
      // props and state, so that we resume it its exact form when/if going back
      if (this._currentComponent)  {
        this.history[this.history.index].props =
          this._currentComponent.generateSnapshot();
      }
      var transitionType = this.history.push(historyEntry);
      // Pushing an identical history entry is ignored
      if (transitionType == Cosmos.RouterHistory.transitionTypes.NOOP) {
        return;
      }
      // We always fetch the current entry after pushing it, because it can
      // differ from the one pushed. See how RouterHistory works
      historyEntry = this.history[this.history.index];
      // We only need separate containers for transitions. Static routing will
      // reuse a single container
      var componentContainer =
        this.options.transition ?
        this._createComponentContainer(historyEntry.queryString) :
        this.container;
      // We need a reference to the current Component in order to generate an
      // up-to-date snapshot of it before loading a new Component, for caching
      // purposes, when navigating between Components
      this._currentComponent =
        Cosmos.render(historyEntry.props, componentContainer, function() {
          // Add the new component to DOM only after it successfully renders
          // for the first time
          $(this.container).append(componentContainer);
          this._transitionComponentContainer(componentContainer, transitionType);
        }.bind(this));
    },
    _transitionComponentContainer: function(componentContainer, transitionType) {
      if (!this.options.transition) {
        return;
      }
      new this.options.transition({
        prevContainer: $(componentContainer).prev().get(0),
        nextContainer: componentContainer,
        history: this.history,
        transitionType: transitionType
      });
    },
    _resetContainer: function() {
      // The Router container must only host Component containers
      $(this.container).empty();
    },
    _createComponentContainer: function(queryString) {
      $container = $('<div class="' + Cosmos.Router.CONTAINER_CLASS + '"></div>');
      return $container.get(0);
    },
    _replaceHistoryState: function(props, href) {
      window.history.replaceState(props, '', href);
    },
    _pushHistoryState: function(state, href) {
      window.history.pushState(state, '', href);
    }
  }
});

Cosmos.serialize = {
  getPropsFromQueryString: function(queryString) {
    var props = {};
    if (queryString.length) {
      var pairs = queryString.split('&'),
          parts,
          key,
          value;
      for (var i = 0; i < pairs.length; i++) {
        parts = pairs[i].split('=');
        key = parts[0];
        value = decodeURIComponent(parts[1]);
        try {
          value = JSON.parse(value);
        } catch(e) {
          // If the prop was a simple type and not a stringified JSON it will
          // keep its original value
        }
        props[key] = value;
      }
    }
    return props;
  },
  getQueryStringFromProps: function(props) {
    var parts = [],
        value;
    for (var key in props) {
      value = props[key];
      // Objects can be embedded in a query string as well
      if (typeof value == 'object') {
        try {
          value = JSON.stringify(value);
        } catch(e) {
          // Props that can't be stringified should be ignored
          continue;
        }
      }
      parts.push(key + '=' + encodeURIComponent(value));
    }
    return parts.join('&');
  }
};

Cosmos.url = {
  getParams: function() {
    return Cosmos.serialize.getPropsFromQueryString(
      window.location.search.substr(1));
  },
  isPushStateSupported: function() {
    return !!window.history.pushState;
  }
};

Cosmos.transitions.Zoom = function(options) {
  // Do nothing on first Components, their container is visible by default
  if (options.transitionType == Cosmos.RouterHistory.transitionTypes.INITIAL) {
    return;
  }
  // The next container will always be inserted after of the previous in the
  // DOM tree, even when going backwards in history. We use z-index to place
  // them on top of eachother
  var $prev = $(options.prevContainer),
      $next = $(options.nextContainer),
      $parent = $next.parent(),
      rect = {
        width: $parent.width(),
        height: $parent.height()
      },
      originBounds = this._getOriginBoundsForTransition(options.transitionType, options.history),
      transitionAnchors = this._getTransitionAnchors(rect, originBounds, options.transitionType);
  // Previous containers need to be on front when going back, to simulate the
  // same visual hierarchy from the inverse forward transition
  if (options.transitionType == Cosmos.RouterHistory.transitionTypes.BACK) {
    $prev.css('z-index', 2);
  }
  // End any currently running transitions (this will also call their
  // callback one more time with max ratio [1], ensuring previous DOM
  // containers are removed when adding new ones)
  // The previous Component container will be removed at the end of the
  // transition (React GC should take over)
  Play.start({id: this, time: 0.5, onFrame: function(ratio) {
    var translatedPositionAndScale =
      this._getPositionAndScaleInTransition(
          rect,
          transitionAnchors,
          options.transitionType,
          ratio);
    $prev.css(translatedPositionAndScale.prev);
    $next.css(translatedPositionAndScale.next);
    if (options.transitionType == Cosmos.RouterHistory.transitionTypes.BACK) {
      $prev.css('opacity', 1 - ratio);
      $next.css('opacity', 1);
    } else {
      $prev.css('opacity', 1);
      $next.css('opacity', ratio);
    }
    if (ratio == 1) {
      // TODO: Make this a complete callback from the Router
      React.unmountComponentAtNode(options.prevContainer);
      $prev.remove();
    }
  }.bind(this)});
};
Cosmos.transitions.Zoom.prototype = {
  _getOriginBoundsForTransition: function(transitionType, history) {
    var historyIndex =
      transitionType == Cosmos.RouterHistory.transitionTypes.BACK ?
      history.index + 1 :
      history.index;
    return history[historyIndex].originBounds;
  },
  _getTransitionAnchors: function(rect, originBounds) {
    var deflatedScale = originBounds.width / rect.width,
        inflatedScale = 1 / deflatedScale;
    return {
      fullScreen: {
        scale: 1,
        x: 0,
        y: 0
      },
      awayFromScreen: {
        scale: deflatedScale,
        x: -originBounds.x,
        y: -originBounds.y
      },
      inFrontOfScreen: {
        scale: inflatedScale,
        x: originBounds.x,
        y: originBounds.y
      }
    };
  },
  _getPositionAndScaleInTransition: function(rect,
                                             transitionAnchors,
                                             transitionType,
                                             ratio) {
    if (transitionType == Cosmos.RouterHistory.transitionTypes.BACK) {
      return {
        prev: this._translateRectPositionAndScale(
          rect,
          transitionAnchors.awayFromScreen,
          transitionAnchors.fullScreen,
          1 - ratio),
        next: this._translateRectPositionAndScale(
          rect,
          transitionAnchors.fullScreen,
          transitionAnchors.inFrontOfScreen,
          1 - ratio)
      };
    } else {
      return {
        prev: this._translateRectPositionAndScale(
          rect,
          transitionAnchors.fullScreen,
          transitionAnchors.inFrontOfScreen,
          ratio),
        next: this._translateRectPositionAndScale(
          rect,
          transitionAnchors.awayFromScreen,
          transitionAnchors.fullScreen,
          ratio)
      };
    }
  },
  _translateRectPositionAndScale: function(rect, initialAnchor, targetAnchor, ratio) {
    /**
     * Function used for achieving a zoom in or out effect on a DOM element
     * through the CSS3 `transform` property. Given an rectangle with an
     * initial and a target anchor (each with a scale factor and an anchor
     * point to align the top-left corner to, at each side of the animation),
     * plus a ratio between 0 and 1 that should represent a given place in time
     * in the middle of the running animation (one loop), the function will
     * return a corresponding scale number and x, y coordonates. They will be
     * applied using the scale() and translate() CSS transform functions. E.g.
     *
     *   var rect = {
     *     width: 200,
     *     height: 200
     *   };
     *   var initialAnchor = {
     *     scale: 1,
     *     x: 0,
     *     y: 0
     *   };
     *   // This will zoom in a way that if the initial rect was viewed through
     *   // a 200x200-sized viewport you could only see the bottom-right corner
     *   // of the rect at the end of the animation (when ratio would become 1)
     *   var targetAnchor = {
     *     scale: 2,
     *     x: 100,
     *     y: 100
     *   };
     *   translateRectPositionAndScale(rect, initialAnchor, targetAnchor, 0);
     *   // {scale: 1, x: 0, y: 0}
     *   translateRectPositionAndScale(rect, initialAnchor, targetAnchor, 0.5);
     *   // {scale: 1.5, x: -33.33, y: -33.33}
     *   translateRectPositionAndScale(rect, initialAnchor, targetAnchor, 1);
     *   // {scale: 2, x: -50, y: -50}
     */
    var relativeScale = targetAnchor.scale - initialAnchor.scale,
        currentScale = initialAnchor.scale + relativeScale * ratio,
        reversedScale = targetAnchor.scale / currentScale,
        relativeOffset = {
          x: targetAnchor.x - initialAnchor.x,
          y: targetAnchor.y - initialAnchor.y
        },
        currentOffset = {
          x: initialAnchor.x + relativeOffset.x * ratio,
          y: initialAnchor.y + relativeOffset.y * ratio
        };
    var newRect = {
      scale: currentScale,
      // Move top-left corner in the middle of the viewport
      x: rect.width / 2,
      y: rect.height / 2
    };
    // Move top-left corner in the top-left corner of the viewport (the
    // viewport size is the only absolute in this formula, thus we need to
    // constantly translate it to be relative to our current scale)
    newRect.x -= rect.width / 2 / currentScale;
    newRect.y -= rect.height / 2 / currentScale;
    // Apply position offset between target and initial anchor (since the scale
    // is different for any ratio we need to adapt the offset to it)
    newRect.x -= currentOffset.x * reversedScale;
    newRect.y -= currentOffset.y * reversedScale;
    return newRect;
  }
};

Cosmos.mixins.ClassName = {
  getClassName: function() {
    var classes = [];
    if (this.defaultClass) {
      classes.push(this.defaultClass);
    }
    if (this.props.class) {
      classes.push(this.props.class);
    }
    return classes.length ? classes.join(' ') : null;
  }
};

Cosmos.mixins.DataFetch = {
  /**
   * Bare functionality for fetching server-side JSON data inside a Component.
   *
   * Props:
   *   - dataUrl: A URL to fetch data from. Once data is received it will be
   *              set inside the Component's state, under the data key, and
   *              will cause a reactive re-render.
   *   - pollInterval: An interval in milliseconds for polling the data URL.
   *                   Defaults to 0, which means no polling.
   *
   * Context properties:
   *  - initialData: The initial value of state.data, before receiving and data
   *                 from the server (see dataUrl prop.) Defaults to an empty
   *                 object `{}`
   */
  fetchDataFromServer: function(url, onSuccess) {
    var request = $.ajax({
      url: url,
      dataType: 'json',
      complete: function() {
        this.xhrRequests = _.without(this.xhrRequests, request);
      }.bind(this),
      success: onSuccess,
      error: function(xhr, status, err) {
        console.error(url, status, err.toString());
      }.bind(this)
    });
    this.xhrRequests.push(request);
  },
  receiveDataFromServer: function(data) {
    this.setState({data: data});
  },
  getInitialData: function() {
    // The default data object is an empty Object. A List Component would
    // override initialData with an empty Array and other Components might want
    // some defaults inside the initial data
    return this.initialData !== undefined ? this.initialData : {};
  },
  resetData: function(props) {
    // Previous data must be cleared before new one arrives
    this.setState({data: this.getInitialData()});
    // Clear any on-going polling when data is reset. Even if polling is still
    // enabled, we need to reset the interval to start from now
    this.clearDataRequests();
    if (props.dataUrl) {
      this.fetchDataFromServer(props.dataUrl, this.receiveDataFromServer);
      if (props.pollInterval) {
        this.pollInterval = setInterval(function() {
          this.fetchDataFromServer(props.dataUrl, this.receiveDataFromServer);
        }.bind(this), props.pollInterval);
      }
    }
  },
  clearDataRequests: function() {
    // Cancel any on-going request and future polling
    while (!_.isEmpty(this.xhrRequests)) {
      this.xhrRequests.pop().abort();
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  },
  getDefaultProps: function() {
    return {
      // Enable polling by setting a value bigger than zero, in ms
      pollInterval: 0
    };
  },
  componentWillMount: function() {
    this.xhrRequests = [];
    // The dataUrl prop points to a source of data than will extend the initial
    // state of the component, once it will be fetched
    this.resetData(this.props);
  },
  componentWillReceiveProps: function(nextProps) {
    // A Component can have its configuration replaced at any time
    if (nextProps.dataUrl != this.props.dataUrl) {
      this.resetData(nextProps);
    }
  },
  componentWillUnmount: function() {
    this.clearDataRequests();
  }
};

Cosmos.mixins.PersistState = {
  /**
   * Heart of the Cosmos framework. Enables dumping a state object into a
   * Component and exporting the current state.
   *
   * Props:
   *   - state: An object that will be poured inside the initial Component
   *            state as soon as it loads (replacing any default state.)
   */
  generateSnapshot: function() {
    /**
     * Generate a snapshot of the Component props (including current state.)
     * It excludes internal props set by React during run-time and props with
     * default values.
     */
    var defaultProps = this.getDefaultProps ? this.getDefaultProps() : {},
        props = {},
        value,
        state;
    for (var key in this.props) {
      value = this.props[key];
      // Ignore "system" props
      if (key == '__owner__' ||
        // Current state should be used instead of initial one
        key == 'state') {
        continue;
      }
      // No point in embedding default props
      if (defaultProps.hasOwnProperty(key) && defaultProps[key] == value) {
        continue;
      }
      props[key] = value;
    }
    state = _.clone(this.state);
    if (!_.isEmpty(state)) {
      props.state = state;
    }
    return props;
  },
  componentWillMount: function() {
    // Allow passing a serialized snapshot of a state through the props
    if (this.props.state) {
      this.replaceState(this.props.state);
    }
  },
  componentWillReceiveProps: function(nextProps) {
    // A Component can have its configuration replaced at any time
    if (nextProps.state) {
      this.replaceState(nextProps.state);
    }
  }
};

Cosmos.mixins.Url = {
  /**
   * Enables basic linking between Components, with optional use of the minimal
   * built-in Router.
   */
  getUrlFromProps: function(props) {
    /**
     * Serializes a props object into a browser-complient URL. The URL
     * generated can be simply put inside the href attribute of an <a> tag, and
     * can be combined with the generateSnapshot method of the PersistState
     * Mixin to create a link that opens the current Component at root level
     * (full window.)
     */
    return '?' + Cosmos.serialize.getQueryStringFromProps(props);
  },
  routeLink: function(e) {
    /**
     * Any <a> tag can have this method bound to its onClick event to have
     * their corresponding href location picked up by the built-in Router
     * implementation, which uses pushState to switch between Components
     * instead of reloading pages.
     */
    e.preventDefault();
    var anchor = e.currentTarget;
    App.router.goTo($(anchor).attr('href'), this._getOriginBounds(anchor));
  },
  _getOriginBounds: function(anchorElement) {
    // Get the closest Component ancestor of anchor element
    var $parentComponent = $(this.getDOMNode()),
        $parentContainer =
          $parentComponent.closest('.' + Cosmos.Router.CONTAINER_CLASS),
        componentOffset = $parentComponent.offset(),
        containerOffset = $parentContainer.offset();
    // Cosmos doesn't need to run in the body element directly, so we need to
    // calculate relative offsets
    if (containerOffset) {
      componentOffset.left -= containerOffset.left;
      componentOffset.top -= containerOffset.top;
    }
    return {
      width: $parentComponent.outerWidth(),
      height: $parentComponent.outerHeight(),
      x: componentOffset.left,
      y: componentOffset.top
    };
  }
};

/** @jsx React.DOM */

Cosmos.components.List = React.createClass({
  /**
   * {
   *   component: 'List',
   *   dataUrl: 'http://localhost/static/users.json'
   * }
   */
  mixins: [Cosmos.mixins.ClassName,
           Cosmos.mixins.DataFetch,
           Cosmos.mixins.PersistState],
  defaultClass: 'list',
  initialData: [],
  render: function() {
    return (
      React.DOM.ul( {className:this.getClassName()}, 
        this.state.data.map(function(item, index) {
          var itemComponent = Cosmos.getComponentByName(
            this._getComponentClassForItem(item));
          return React.DOM.li( {key:index}, itemComponent(_.clone(item)))
        }.bind(this))
      )
    );
  },
  _getComponentClassForItem: function(itemProps) {
      return itemProps.component || this.props.itemComponent || 'Item';
  }
});
