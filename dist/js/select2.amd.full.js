define('select2/utils',[], function () {
  var Utils = {};

  Utils.Extend = function (ChildClass, SuperClass) {
    var __hasProp = {}.hasOwnProperty

    function BaseConstructor () {
      this.constructor = ChildClass;
    }

    for (var key in SuperClass) {
      if (__hasProp.call(SuperClass, key)) {
        ChildClass[key] = SuperClass[key];
      }
    }

    BaseConstructor.prototype = SuperClass.prototype;
    ChildClass.prototype = new BaseConstructor();
    ChildClass.__super__ = SuperClass.prototype;

    return ChildClass;
  };

  function getMethods (theClass) {
    var proto = theClass.prototype;

    var methods = [];

    for (var methodName in proto) {
      var m = proto[methodName];

      if (typeof m !== "function") {
        continue;
      }

      methods.push(methodName);
    }

    return methods;
  }

  Utils.Decorate = function (SuperClass, DecoratorClass) {
    var decoratedMethods = getMethods(DecoratorClass);
    var superMethods = getMethods(SuperClass);

    function DecoratedClass () {
      var unshift = Array.prototype.unshift;

      var argCount = DecoratorClass.prototype.constructor.length;

      var calledConstructor = SuperClass.prototype.constructor;

      if (argCount > 0) {
        unshift.call(arguments, SuperClass.prototype.constructor);

        calledConstructor = DecoratorClass.prototype.constructor;
      }

      calledConstructor.apply(this, arguments);
    }

    DecoratorClass.displayName = SuperClass.displayName;

    function ctr () {
      this.constructor = DecoratedClass;
    }

    DecoratedClass.prototype = new ctr();

    for (var m = 0; m < superMethods.length; m++) {
        var methodName = superMethods[m];

        DecoratedClass.prototype[methodName] = SuperClass.prototype[methodName];
    }

    for (var m = 0; m < decoratedMethods.length; m++) {
      var methodName = decoratedMethods[m];

      function calledMethod (methodName) {
        // Stub out the original method if it's not decorating an actual method
        var originalMethod = function () {};

        if (methodName in DecoratedClass.prototype) {
          originalMethod = DecoratedClass.prototype[methodName];
        }

        var decoratedMethod = DecoratorClass.prototype[methodName];

        return function () {
          var unshift = Array.prototype.unshift;

          unshift.call(arguments, originalMethod);

          return decoratedMethod.apply(this, arguments);
        }
      }

      DecoratedClass.prototype[methodName] = calledMethod(methodName);
    }

    return DecoratedClass;
  }

  var Observable = function () {
    this.listeners = {};
  };

  Observable.prototype.on = function (event, callback) {
    if (event in this.listeners) {
      this.listeners[event].push(callback);
    } else {
      this.listeners[event] = [callback];
    }
  };

  Observable.prototype.trigger = function (event) {
    var slice = Array.prototype.slice;

    if (event in this.listeners) {
      this.invoke(this.listeners[event], slice.call(arguments, 1));
    }

    if ("*" in this.listeners) {
      this.invoke(this.listeners["*"], arguments);
    }
  };

  Observable.prototype.invoke = function (listeners, params) {
    for (var i = 0, len = listeners.length; i < len; i++) {
      listeners[i].apply(this, params);
    }
  };

  Utils.Observable = Observable;

  return Utils;
});

define('select2/data/select',[
  '../utils',
  'jquery'
], function (Utils, $) {
  function SelectAdapter ($element, options) {
    this.$element = $element;

    SelectAdapter.__super__.constructor.call(this);
  }

  Utils.Extend(SelectAdapter, Utils.Observable);

  SelectAdapter.prototype.current = function (callback) {
    var data = [];
    var self = this;

    this.$element.find(":selected").each(function () {
      var $option = $(this);

      var option = self.item($option);

      data.push(option);
    });

    callback(data);
  };

  SelectAdapter.prototype.select = function (data) {
    var self = this;

    if (this.$element.prop("multiple")) {
      this.current(function (currentData) {
        var val = [];

        data = [data];
        data.push.apply(data, currentData);

        for (var d = 0; d < data.length; d++) {
          id = data[d].id;

          if (val.indexOf(id) === -1) {
            val.push(id);
          }
        }

        self.$element.val(val);
        self.$element.trigger("change");
      });
    } else {
      var val = data.id;

      this.$element.val(val);
      this.$element.trigger("change");
    }
  };

  SelectAdapter.prototype.unselect = function (data) {
    var self = this;

    if (!this.$element.prop("multiple")) {
      return;
    }

    this.current(function (currentData) {
      var val = [];

      for (var d = 0; d < currentData.length; d++) {
        id = currentData[d].id;

        if (id !== data.id && val.indexOf(id) === -1) {
          val.push(id);
        }
      }

      self.$element.val(val);
      self.$element.trigger("change");
    });
  }

  SelectAdapter.prototype.bind = function (container, $container) {
    var self = this;

    container.on("select", function (params) {
      self.select(params.data);
    });

    container.on("unselect", function (params) {
      self.unselect(params.data);
    });
  }

  SelectAdapter.prototype.query = function (params, callback) {
    var data = [];
    var self = this;

    this.$element.find("option").each(function () {
      var $option = $(this);

      var option = self.item($option);

      if (self.matches(params, option)) {
        data.push(option);
      }
    });

    callback(data);
  };

  SelectAdapter.prototype.item = function ($option) {
    var data = {
      id: $option.val(),
      text: $option.html()
    };

    return data;
  };

  SelectAdapter.prototype.matches = function (params, data) {
    if ($.trim(params.term) == "") {
      return true;
    }

    if (data.text.indexOf(params.term) > -1) {
      return true;
    }

    return false;
  }

  return SelectAdapter;
});

define('select2/results',[
  './utils'
], function (Utils) {
  function Results ($element, options, dataAdapter) {
    this.$element = $element;
    this.data = dataAdapter;

    Results.__super__.constructor.call(this);
  }

  Utils.Extend(Results, Utils.Observable);

  Results.prototype.render = function () {
    var $results = $(
      '<ul class="options"></ul>'
    );

    this.$results = $results;

    return $results;
  };

  Results.prototype.clear = function () {
    this.$results.empty();
  };

  Results.prototype.append = function (data) {
    var $options = [];

    for (var d = 0; d < data.length; d++) {
      var item = data[d];

      var $option = this.option(item);

      $options.push($option);
    }

    this.$results.append($options);
  };

  Results.prototype.setClasses = function () {
    var self = this;

    this.data.current(function (selected) {
      selected = $.map(selected, function (s) { return s.id; });

      self.$results.find(".option.selected").removeClass("selected");

      var $options = self.$results.find(".option");

      $options.each(function () {
        var $option = $(this);
        var item = $option.data("data");

        if (selected.indexOf(item.id) > -1) {
          $option.addClass("selected");
        }
      });
    });
  };

  Results.prototype.option = function (data) {
    var $option = $(
      '<li class="option"></li>'
    );

    $option.html(data.text);
    $option.data("data", data);

    return $option;
  }

  Results.prototype.bind = function (container, $container) {
    var self = this;

    this.on("results:all", function (data) {
      self.clear();
      self.append(data);

      self.setClasses();
    });

    this.on("results:append", function (data) {
      self.append(data);

      self.setClasses();
    })

    this.$results.on("click", ".option", function (evt) {
      var $this = $(this);

      var data = $this.data("data");
      if ($this.hasClass("selected")) {
        self.trigger("unselected", {
          originalEvent: evt,
          data: data
        })

        self.setClasses();

        return;
      }

      self.trigger("selected", {
        originalEvent: evt,
        data: data
      });

      self.setClasses();
    });

    this.$results.on("mouseenter", ".option", function (evt) {
      self.$results.find(".option.highlighted").removeClass("highlighted");
      $(this).addClass("highlighted");
    });

    this.$results.on("mouseleave", ".option", function (evt) {
      $(this).removeClass("highlighted");
    });
  };

  return Results;
})
;
define('select2/dropdown',[
  './utils'
], function (Utils) {
  function Dropdown ($element, options) {
    this.$element = $element;
  }

  Utils.Extend(Dropdown, Utils.Observable);

  Dropdown.prototype.render = function () {
    var $dropdown = $(
      '<span class="">' +
        '<span class="results"></span>' +
      '</span>'
    );

    return $dropdown;
  }

  return Dropdown;
})
;
define('select2/selection/single',[
  '../utils'
], function (Utils) {
  function SingleSelection ($element, options) {
    this.$element = $element;
    this.options = options;

    SingleSelection.__super__.constructor.call(this);
  }

  Utils.Extend(SingleSelection, Utils.Observable);

  SingleSelection.prototype.render = function () {
    var $selection = $(
      '<span class="single-select">' +
        '<span class="rendered-selection"></span>' +
      '</span>'
    );

    this.$selection = $selection;

    return $selection;
  }

  SingleSelection.prototype.bind = function (container, $container) {
    var self = this;

    this.$selection.on('click', function (evt) {
      self.trigger("toggle", {
        originalEvent: evt
      });
    });

    container.on("selection:update", function (params) {
      self.update(params.data);
    })
  }

  SingleSelection.prototype.clear = function () {
    this.$selection.find(".rendered-selection").empty();
  }

  SingleSelection.prototype.display = function (data) {
    return data.text;
  }

  SingleSelection.prototype.update = function (data) {
    if (data.length == 0) {
      this.clear();
      return;
    }

    var selection = data[0];

    var formatted = this.display(selection);

    this.$selection.find(".rendered-selection").html(formatted);
  }

  return SingleSelection;
});

define('select2/selection/multiple',[
  '../utils'
], function (Utils) {
  function MultipleSelection ($element, options) {
    this.$element = $element;
    this.options = options;

    MultipleSelection.__super__.constructor.call(this);
  }

  Utils.Extend(MultipleSelection, Utils.Observable);

  MultipleSelection.prototype.render = function () {
    var $selection = $(
      '<span class="multiple-select">' +
        '<ul class="rendered-selection"></ul>' +
      '</span>'
    );

    this.$selection = $selection;

    return $selection;
  }

  MultipleSelection.prototype.bind = function (container, $container) {
    var self = this;

    this.$selection.on('click', function (evt) {
      self.trigger("toggle", {
        originalEvent: evt
      });
    });

    container.on("selection:update", function (params) {
      self.update(params.data);
    });
  }

  MultipleSelection.prototype.clear = function () {
    this.$selection.find(".rendered-selection").empty();
  }

  MultipleSelection.prototype.display = function (data) {
    return data.text;
  }

  MultipleSelection.prototype.update = function (data) {
    this.clear();

    if (data.length == 0) {
      return;
    }

    var $selections = [];

    for (var d = 0; d < data.length; d++) {
      var selection = data[d];

      var formatted = this.display(selection);

      var $selection = $('<ul class="choice"></ul>');

      $selection.text(formatted);
      $selection.data("data", data);

      $selections.push($selection);
    }

    this.$selection.find(".rendered-selection").append($selections);
  }

  return MultipleSelection;
});

define('select2/options',[
  './data/select',
  './results',
  './dropdown',
  './selection/single',
  './selection/multiple'
], function (SelectData, ResultsList, Dropdown, SingleSelection,
             MultipleSelection) {
  function Options (options) {
    this.options = options;

    this.dataAdapter = SelectData;
    this.resultsAdapter = ResultsList;
    this.dropdownAdapter = options.dropdownAdapter || Dropdown;
    this.selectionAdapter = options.selectionAdapter;

    if (this.selectionAdapter == null) {
      if (this.options.multiple) {
        this.selectionAdapter = MultipleSelection;
      } else {
        this.selectionAdapter = SingleSelection;
      }
    }
  }

  return Options;
})
;
define('select2/core',[
  'jquery',
  './options',
  './utils'
], function ($, Options, Utils) {
  var Select2 = function ($element, options) {
    this.$element = $element;

    options = options || {};

    options.multiple = options.multiple || $element.prop("multiple");

    this.options = new Options(options);

    Select2.__super__.constructor.call(this);

    // Set up containers and adapters

    this.data = new this.options.dataAdapter($element, this.options);

    var $container = this.render();

    $container.insertAfter(this.$element);

    $container.width($element.width());

    this.selection = new this.options.selectionAdapter($element, this.options);

    var $selectionContainer = $container.find(".selection");
    var $selection = this.selection.render();

    $selectionContainer.append($selection);

    this.dropdown = new this.options.dropdownAdapter($element, this.options);

    var $dropdownContainer = $container.find(".dropdown");
    var $dropdown = this.dropdown.render();

    $dropdownContainer.append($dropdown);

    this.results = new this.options.resultsAdapter($element, this.options, this.data);

    var $resultsContainer = $dropdown.find(".results");
    var $results = this.results.render();

    $resultsContainer.append($results);

    // Bind events

    var self = this;

    this.data.bind(this, $container);
    this.selection.bind(this, $container);
    this.results.bind(this, $container);

    this.$element.on("change", function () {
      self.data.current(function (data) {
        self.trigger("selection:update", {
          data: data
        });
      });
    });

    this.selection.on("toggle", function () {
      $container.toggleClass("open");
    });

    this.results.on("selected", function (params) {
      self.trigger("select", params);

      $container.removeClass("open");
    });

    this.results.on("unselected", function (params) {
      self.trigger("unselect", params);

      $container.removeClass("open");
    });

    // Set the initial state

    this.data.current(function (initialData) {
      self.selection.update(initialData);
    });

    this.data.query({}, function (data) {
      self.results.trigger("results:all", data);
    });
  };

  Utils.Extend(Select2, Utils.Observable);

  Select2.prototype.render = function () {
    var $container = $(
      '<span class="select2 select2-container select2-theme-default">' +
        '<span class="selection"></span>' +
        '<span class="dropdown"></span>' +
      '</span>'
    );

    return $container;
  };

  return Select2;
});

