(function ( $ ) {
  var Utils = {
    proto_inheritance: function (base, child) {
      child.prototype = new base();
      child.prototype.constructor = base;
    },

    logger: function(mes) {
      console.log(mes);
    },

    uuid: function () {
        function s4() {
          return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
          s4() + '-' + s4() + s4() + s4();
    }

  };

  var STATE = {
    NOT_DRAW: 1,
    DRAWING: 2,
    EDITING: 3,
    DONE: 4
  };

  var ACTIONS = {
    DRAW_LINE: 1,
    EDIT_LINE: 2,
    EDIT_OBJ: 4,
    DONE_EDITING: 5,
    PLAIN: 6,
    RESET_CANVAS: 7,
    PAN: 8,
    DUMMY: 9,
  }

  function ParkMap(options) {
    var container = options.container;
    var width_in_meter = options.width_in_meter;
    var height_in_meter = options.height_in_meter;
    var html_markups =
      "<div id='pm_toolbar'><div class='pm_content' id='pm_toolbar_content'></div></div>" +
      "<div id='pm_content'>" +
      "<div id='pm_mesh_wrapper'>" +
      "<div id='pm_mesh_x_ruler' class='ruler'></div>" +
      "<div id='pm_mesh_y_ruler' class='ruler'></div>" +
      "<div id='pm_mesh'>Canvas </div>" +
      "<div id='pm_ele_editor'> <div id='pm_ele_editor_header' class='pm_header'></div> <div id='pm_ele_editor_content' class='pm_content'> <table></table></div> </div>" + 
      "</div>" +
      "</div>";

    ///////////////////////////////////////////////////////////////////////////
    //
    // Global helper methods
    //
    ///////////////////////////////////////////////////////////////////////////
    instance = this;
    this.objects = []; // list of objects & group with hierarchy
    this.action_queue = []; // pending for future usage

    this.synchronizor = {
      need_sync: false,
      last_sync: null,
      dump:  function() {
        obj = this;
        setInterval(function () {
          if(obj.need_sync){
            objects = [];
            instance.objects.forEach(function (shape) { objects.push(shape.as_json()); });
            $.ajax({type: 'POST', url: create_mesh_path, data: {objects: objects}, dataType: 'JSON'});
            obj.last_sync = (new Date()).getTime();
            obj.need_sync = false;
          }
        }, 2 * 1000);
      },

      load: function (json) {
        json.forEach(function (d) {
          switch (d.name) {
            case 'rect':
              shape = new Rect();
            break;
            case 'line':
              shape = new Line();
            break;
            case 'park_space':
              shape = new ParkSpace();
            break;
            case 'pillar':
              shape = new Pillar();
            break;
            case 'lift':
              shape = new Lift();
            break;
            case 'elevator':
              shape = new Elevator();
            break;
            case 'lane':
              shape = new Lane();
            break;
            default:
              break;
          }

          shape.uuid = d.uuid;

          for(p in d.prop_list){ shape.prop_list[p].setValue(_.values(d.prop_list[p])[0]); }
          if(typeof shape.setStartPoint === "function"){
            shape.setStartPoint(new Point(
              parseFloat(shape.prop_list.left.css_value()),
              parseFloat(shape.prop_list.top.css_value())));
          }

          if(typeof shape.setEndPoint === "function"){
            width  = parseFloat(shape.width_in_px || shape.prop_list.width.css_value());
            if(shape.height_in_px){
              height = shape.height_in_px;
            }else if(shape.prop_list.thickness){
              height = shape.prop_list.thickness.css_value;
            }else{
              height = shape.prop_list.height.css_value();
            }
            height = parseFloat(height);

            shape.setEndPoint(new Point(
              shape.start_point.x_in_px + width,
              shape.start_point.y_in_px + height));
          }
          shape.draw();

        });
      },
      set_need_sync: function () {
        this.need_sync = true;
      }
    };

    this.synchronizor.dump();

    this.context = {
      current_action: null,
      current_shapes: null
    }

    this.initialize = function () {
      container.html(html_markups);
      this.canvas = container.find("#pm_mesh");
      this.pm_ele_editor  = container.find("#pm_ele_editor");

      this.draw_backgroup();
      this.events_registration();

      instance.synchronizor.load(park_map_data);
    },


    this.draw_backgroup = function () {
      this.canvas.attr('height', 3000);
      this.canvas.attr('width', 3000);

      this.draw_toolbar_items();
      this.draw_ruler();
      this.add_mesh();
      this.enter_mesh_main_loop();
    },

    this.events_registration = function () {
      this.canvas_drag_event_registration();
    },

    this.draw_ruler = function () {
      var x_ruler_container = $("#pm_mesh_x_ruler");
      var y_ruler_container = $("#pm_mesh_y_ruler");
      ruler_max = Math.max(height_in_meter, width_in_meter)
      for(var i=0; i<ruler_max; i++){
        if(i%10 == 0){
          x_ruler_container.append($("<div class='big_interval_mark' data-value='" + i +"'>" +i+ "m</div>"));
          y_ruler_container.append($("<div class='big_interval_mark' data-value='" + (ruler_max - i) +"'>" + (ruler_max-i)+ "m</div>"));
        }else{
          x_ruler_container.append($("<div class='small_interval_mark' data-value='" + i +"'></div>"));
          y_ruler_container.append($("<div class='small_interval_mark' data-value='" + (ruler_max-i) +"'></div>"));
        }
      }

      x_ruler_container.find(".big_interval_mark, .small_interval_mark").on('mouseover', function () { });
      y_ruler_container.find(".big_interval_mark, .small_interval_mark").on('mouseover', function () { });
    },

    this.add_mesh = function () {
      table = "";
      for(var i=0; i<height_in_meter; i++){
        table += "<div class='mesh_line'>";
        for(var j=0; j<width_in_meter; j++){
          table += "<span data-x='" + j + "' data-y='"+ i +"' id='slot_" +j+ "_" + i+ "'></span>"
        }
        table += "</div>"
      }

      instance.canvas.html(table);
    }

    this.show_prop_list_window = function (shape) {
      self = this;
      this.pm_ele_editor.show();

      _.values(shape.prop_list).forEach(function (prop) {
        tmp = $(prop.to_html());
        tmp.find("select,input").on('change', function (val) {
          prop.setValue($(this).val());
          shape.update();
        });

        self.pm_ele_editor.find("#pm_ele_editor_content table").append(tmp);
      });
      this.pm_ele_editor.find("#pm_ele_editor_content table");
    };
    this.hide_prop_list_window = function (shape) {
      this.pm_ele_editor.hide();
      this.pm_ele_editor.find("#pm_ele_editor_content table").empty();
    };

    ///////////////////////////////////////////////////////////////////////////
    //
    // draw action items
    //
    ///////////////////////////////////////////////////////////////////////////

    this.draw_toolbar_items = function () {
      var ToolbarItem = function () {
        this.name = null;
        this.icon = null;
        this.cn_name = null;
        this.callback = null;

        this.as_html = function () {
          return "<div class='toolbaritem'><div class='toolbaritem_icon "+ this.icon +"'></div><div class='toolbaritem_name'> " +this.cn_name+ " </div></div>";
        }
      }

      var toolbar_items = [];

      var reset_canvas_item = new ToolbarItem();
      reset_canvas_item.name = "plain";
      reset_canvas_item.cn_name = "归位";
      reset_canvas_item.icon = 'plain';
      reset_canvas_item.callback = function () {
        var reset_canvas_action = new ResetCanvasAction();
        instance.context.current_action = null;
        instance.context.current_shapes = [];
        reset_canvas_action.take_effect_now();
      }
      toolbar_items.push(reset_canvas_item);


      var pan_item = new ToolbarItem();
      pan_item.name = "pan";
      pan_item.cn_name = "移动";
      pan_item.icon = 'pan';
      pan_item.callback = function () {
        var pan_action = new PanAction();
        // make sure context to previous state
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = pan_action;
        pan_action.take_effect_now();
      }
      toolbar_items.push(pan_item);

      var draw_line = new ToolbarItem();
      draw_line.name = "draw_line";
      draw_line.cn_name = "线";
      draw_line.icon = 'line';
      draw_line.callback = function () {
        var draw_line_action = new DrawLineAction();
        // make sure context to previous state
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_line_action;
        draw_line_action.take_effect_now();
      }
      toolbar_items.push(draw_line);

      var draw_rect = new ToolbarItem();
      draw_rect.name = "draw_rect";
      draw_rect.cn_name = "矩形";
      draw_rect.icon = 'rect';
      draw_rect.callback = function () {
        var draw_rect_action = new DrawRectAction();
        draw_rect_action.shape = new Rect();
        // make sure context to previous state
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_rect_action;
        draw_rect_action.take_effect_now();
      }
      toolbar_items.push(draw_rect);

      var draw_park_space = new ToolbarItem();
      draw_park_space.name = "draw_park_space";
      draw_park_space.cn_name = "车位";
      draw_park_space.icon = 'park_space';
      draw_park_space.callback = function () {
        var draw_park_space_action = new DrawParkSpaceAction();
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_park_space_action;
        draw_park_space_action.take_effect_now();
      }
      toolbar_items.push(draw_park_space);

      var draw_lane = new ToolbarItem();
      draw_lane.name = "draw_lane";
      draw_lane.cn_name = "车道";
      draw_lane.icon = 'lane';
      draw_lane.callback = function () {
        var draw_lane_action = new DrawLaneAction();
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_lane_action;
        draw_lane_action.take_effect_now();
      }
      toolbar_items.push(draw_lane);

      var draw_pillar = new ToolbarItem();
      draw_pillar.name = "draw_pillar";
      draw_pillar.cn_name = "柱子";
      draw_pillar.icon = 'pillar';
      draw_pillar.callback = function () {
        var draw_pillar_action = new DrawPillarAction();
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_pillar_action;
        draw_pillar_action.take_effect_now();
      }
      toolbar_items.push(draw_pillar);

      var draw_lift = new ToolbarItem();
      draw_lift.name = "draw_lift";
      draw_lift.cn_name = "电梯";
      draw_lift.icon = 'lift';
      draw_lift.callback = function () {
        var draw_lift_action = new DrawLiftAction();
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_lift_action;
        draw_lift_action.take_effect_now();
      }
      toolbar_items.push(draw_lift);

      var draw_elevator = new ToolbarItem();
      draw_elevator.name = "draw_elevator";
      draw_elevator.cn_name = "扶梯";
      draw_elevator.icon = 'elevator';
      draw_elevator.callback = function () {
        var draw_elevator_action = new DrawElevatorAction();
        if(instance.context.current_action){
          instance.context.current_action.reset();
        }
        instance.context.current_action = draw_elevator_action;
        draw_elevator_action.take_effect_now();
      }
      toolbar_items.push(draw_elevator);

      var toolbar = $("#pm_toolbar");
      var toolbar_content = $("#pm_toolbar_content");

      for(var i=0; i<toolbar_items.length; i++){
        c =$(toolbar_items[i].as_html());
        c.on('click', toolbar_items[i].callback);
        toolbar_content.append(c);
      }
    }

    /////////////////////////////////////////////////////////////
    //
    // Event handlers 
    //
    /////////////////////////////////////////////////////////////

    this.canvas_drag_event_registration = function () {
      var isDragging = false;
      var dragStartEventTriggered = false;

      instance.canvas.on('mousedown', function () {
        $(instance.canvas).mousemove(function() {
          isDragging = true;
          if(!dragStartEventTriggered){
            instance.canvas.trigger('drag_start', [event]);
            dragStartEventTriggered = true;
          }
          instance.canvas.trigger('draging', [event]);
        });
      }).on('mouseup', function () {
        var wasDragging = isDragging;
        isDragging = false;
        $(instance.canvas).unbind("mousemove");
        if (wasDragging) {
          instance.canvas.trigger('drag_stop', [event]);
          dragStartEventTriggered = false;
        }
      });
    }

    this.enter_mesh_main_loop = function () {
      function is_shape_selection(dblevent) {
        point = Point.from_event(event);
        for(var i=instance.objects.length-1; i>=0; i--){
          if(instance.objects[i].point_within_range(point)){
            return instance.objects[i];
          }
        }
        return null;
      }

      function action_dispatch(event_type, event) {
        dummy_action = new DummyAction();
        if(instance.context.current_action){
          instance.context.current_action.take_effect(new PmEvent(event_type, event));
        }else{
          dummy_action.take_effect(new PmEvent(event_type, event));
        }
      }

      instance.canvas.on('click', function () {
        action_dispatch('click', event);
      });

      instance.canvas.on('dblclick', function (trigger, event) {
        if(instance.context.current_action){ instance.context.current_action.reset(); instance.context.current_action = null;}
        if(shape = is_shape_selection(event)){
          if(shape.name == "line"){
            instance.context.current_action = new EditLineAction(shape);
            instance.context.current_action.take_effect_now();
          }
          if (shape.name == 'rect') {
            instance.context.current_action = new EditRectAction(shape);
            instance.context.current_action.take_effect_now();
          }

          if(shape.name == 'park_space') {
            instance.context.current_action = new EditParkSpaceAction(shape);
            instance.context.current_action.take_effect_now();
          }

          if(shape.name == 'lane') {
            instance.context.current_action = new EditLaneAction(shape);
            instance.context.current_action.take_effect_now();
          }

          if(shape.name == 'pillar') {
            instance.context.current_action = new EditPillarAction(shape);
            instance.context.current_action.take_effect_now();
          }


          if(shape.name == 'lift') {
            instance.context.current_action = new EditLiftAction(shape);
            instance.context.current_action.take_effect_now();
          }


          if(shape.name == 'elevator') {
            instance.context.current_action = new EditElevatorAction(shape);
            instance.context.current_action.take_effect_now();
          }
        }
        action_dispatch('dblclick', event);
      });

      instance.canvas.on('drag_start', function (trigger_event, event) {
        action_dispatch('drag_start', event);
      });

      instance.canvas.on('draging', function (trigger_event, event) {
        action_dispatch('draging', event);
      });

      instance.canvas.on('drag_stop', function (trigger_event, event) {
        action_dispatch('drag_stop', event);
      });
    }


    ///////////////////////////////////////////////////////////////////
    //
    //action definiation
    //
    ///////////////////////////////////////////////////////////////////
    var Action = function () {
      this.name = null;
      this.shape = null;

      this.take_effect = function () {
      }
      this.reset = function () {
      }
    };

    var ResetCanvasAction = function () {
      this.name = ACTIONS.RESET_CANVAS;
      this.take_effect_now = function () {
        instance.canvas.css("left", "20px").css("top", "-20px");
      }
    }

    var PanAction = function () {
      this.name = Action.PAN;
      this.drag_start_x = 0;
      this.drag_start_y = 0;

      this.original_cursor = 'default';

      this.take_effect_now = function () {
        instance.canvas.css('cursor', 'move');
      }

      this.reset = function () {
        instance.canvas.css('cursor', this.original_cursor);
      }

      this.take_effect = function(pm_event) {
        if(pm_event.event_type == "drag_start"){
          this.drag_start_x = pm_event.mouse_event.pageX;
          this.drag_start_y = pm_event.mouse_event.pageY;
        }
        if(pm_event.event_type == "drag_stop"){
          width  = pm_event.mouse_event.pageX - this.drag_start_x;
          height = pm_event.mouse_event.pageY - this.drag_start_y;

          width = parseInt(width / 10) * 10;
          height  = parseInt(height / 10) * 10;

          instance.canvas.css('left', "+=" + width);
          instance.canvas.css('top', "+=" + height);

          this.drag_start_x = 0;
          this.drag_start_y = 0;
        }
      }
    }


    var DrawLineAction = function () {
      this.name = ACTIONS.DRAW_LINE;
      this.shape = new Line();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "drag_start"){
          this.shape.setStartPoint(new Point(offset_x, offset_y));
        }

        if(pm_event.event_type == "draging"){
          this.shape.setEndPoint(new Point(offset_x, offset_y));
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          this.shape.setEndPoint(new Point(offset_x, offset_y));
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditLineAction = function (shape) {
      this.name = ACTIONS.EDIT_LINE;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape.editing();
      }

      this.reset = function () {
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){
            return null;
          }

          if(div.hasClass("left_handle")){ return "left_handle"; }
          if(div.hasClass("right_handle")){ return "right_handle"; }
          if(div.hasClass("remove_handle")){ return "remove_handle"; }
        }

        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == "left_handle"){
            this.shape.setStartPoint(point);
          }else{
            this.shape.setEndPoint(point);
          }
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == 'left_handle'){
            this.shape.setStartPoint(point);
          }else{
            this.shape.setEndPoint(point);
          }
          this.shape.draw();
        }
      }
    }


    var DrawRectAction = function () {
      this.name = ACTIONS.DRAW_RECT;
      this.shape = new Rect();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "drag_start"){
          this.shape.start_point = new Point(offset_x, offset_y);
          this.shape.prop_list.top.setValue("" + offset_y + "px")
          this.shape.prop_list.left.setValue("" + offset_x + "px")
        }

        if(pm_event.event_type == "draging"){
          this.shape.end_point = new Point(offset_x, offset_y);
          this.shape.prop_list.width.setValue("" + this.shape.end_point.x_distance(this.shape.start_point) + "px")
          this.shape.prop_list.height.setValue(""+ this.shape.end_point.y_distance(this.shape.start_point) + "px")
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          this.shape.end_point = new Point(offset_x, offset_y);
          this.shape.prop_list.width.setValue("" + this.shape.end_point.x_distance(this.shape.start_point) + "px")
          this.shape.prop_list.height.setValue(""+ this.shape.end_point.y_distance(this.shape.start_point) + "px")

          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditRectAction = function (shape) {
      this.name = ACTIONS.EDIT_RECT;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.rect_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.rect_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".rect_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("rect_move_handle")){ return "rect_move_handle"; }
          if(div.hasClass("rect_left_handle")){ return "rect_left_handle"; }
          if(div.hasClass("rect_right_handle")){ return "rect_right_handle"; }
          if(div.hasClass("rect_remove_handle")){ return "rect_remove_handle"; }
          if(div.hasClass("rect_rotate_handle")){ return "rect_rotate_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "rect_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == "rect_left_handle"){
            this.shape.setStartPoint(point);
          }else if(this.which_point_move == "rect_right_handle"){
            this.shape.setEndPoint(point);
          }else if(this.which_point_move == 'rect_rotate_handle'){
            dy = point.y_in_px - this.shape_initial_center.y_in_px;
            dx = point.x_in_px - this.shape_initial_center.x_in_px;

            theta = Math.atan2(dy, dx);
            theta *= 180/Math.PI ;
            this.shape.rotate(theta);
          }
          else {
            offset_x = point.x_in_px - this.drag_start_point.x_in_px;
            offset_y = point.y_in_px - this.drag_start_point.y_in_px;

            this.shape.setStartPoint(new Point(this.shape_initial_start_point.x_in_px + offset_x, this.shape_initial_start_point.y_in_px + offset_y));
            this.shape.setEndPoint(new Point(this.shape_initial_end_point.x_in_px + offset_x, this.shape_initial_end_point.y_in_px + offset_y));

          }
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == 'rect_left_handle'){
            this.shape.start_point = point;
          }else if(this.which_point_move == 'rect_right_handle'){
            this.shape.end_point = point;
          }
          this.shape.draw();
        }
      }
    }


    var DrawLaneAction = function () {
      this.name = ACTIONS.DRAW_LANE;
      this.shape = new Lane();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "drag_start"){
          this.shape.setStartPoint(new Point(offset_x, offset_y))
        }

        if(pm_event.event_type == "draging"){
          this.shape.setEndPoint(new Point(offset_x, offset_y))
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          this.shape.setEndPoint(new Point(offset_x, offset_y))
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditLaneAction = function (shape) {
      this.name = ACTIONS.EDIT_LANE;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.lane_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.lane_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".lane_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("lane_move_handle")){ return "lane_move_handle"; }
          if(div.hasClass("lane_right_handle")){ return "lane_right_handle"; }
          if(div.hasClass("lane_remove_handle")){ return "lane_remove_handle"; }
          if(div.hasClass("lane_rotate_handle")){ return "lane_rotate_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "lane_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == "lane_right_handle"){
            this.shape.setEndPoint(new Point(point.x_in_px, this.shape.end_point.y_in_px));
          }else if(this.which_point_move == 'lane_rotate_handle'){
            dy = point.y_in_px - this.shape_initial_center.y_in_px;
            dx = point.x_in_px - this.shape_initial_center.x_in_px;

            theta = Math.atan2(dy, dx);
            theta *= 180/Math.PI ;
            this.shape.rotate(theta);
          }
          else {
            offset_x = point.x_in_px - this.drag_start_point.x_in_px;
            offset_y = point.y_in_px - this.drag_start_point.y_in_px;

            this.shape.setStartPoint(new Point(this.shape_initial_start_point.x_in_px + offset_x, this.shape_initial_start_point.y_in_px + offset_y));
            this.shape.setEndPoint(new Point(this.shape_initial_end_point.x_in_px + offset_x, this.shape.start_point.y_in_px + 50));
          }
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

        }
      }
    }



    var DrawParkSpaceAction = function () {
      this.name = ACTIONS.DRAW_PARK_SPACE;
      this.shape = new ParkSpace();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "click"){
          this.shape.set_center(new Point(offset_x, offset_y));
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditParkSpaceAction = function (shape) {
      this.name = ACTIONS.EDIT_PARK_SPACE;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.park_space_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.park_space_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".park_space_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("park_space_move_handle")){ return   "park_space_move_handle"; }
          if(div.hasClass("park_space_remove_handle")){ return "park_space_remove_handle"; }
          if(div.hasClass("park_space_rotate_handle")){ return "park_space_rotate_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "park_space_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          if(this.which_point_move == 'park_space_rotate_handle'){
            dy = point.y_in_px - this.shape_initial_center.y_in_px;
            dx = point.x_in_px - this.shape_initial_center.x_in_px;

            theta = Math.atan2(dy, dx);
            theta *= 180/Math.PI ;
            this.shape.rotate(theta);
          }
          else {
            offset_x = point.x_in_px - this.drag_start_point.x_in_px;
            offset_y = point.y_in_px - this.drag_start_point.y_in_px;

            new_center = new Point(this.shape_initial_center.x_in_px + offset_x, this.shape_initial_center.y_in_px + offset_y)
            this.shape.set_center(new_center);

          }
          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          this.shape.draw();
        }
      }
    }


    var DrawPillarAction = function () {
      this.name = ACTIONS.DRAW_PILLAR;
      this.shape = new Pillar();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "click"){
          this.shape.set_center(new Point(offset_x, offset_y));
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditPillarAction = function (shape) {
      this.name = ACTIONS.EDIT_PARK_SPACE;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.pillar_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.pillar_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".pillar_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("pillar_move_handle")){ return   "pillar_move_handle"; }
          if(div.hasClass("pillar_remove_handle")){ return "pillar_remove_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "pillar_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          offset_x = point.x_in_px - this.drag_start_point.x_in_px;
          offset_y = point.y_in_px - this.drag_start_point.y_in_px;

          new_center = new Point(this.shape_initial_center.x_in_px + offset_x, this.shape_initial_center.y_in_px + offset_y)
          this.shape.set_center(new_center);

          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          this.shape.draw();
        }
      }
    }


    var DrawLiftAction = function () {
      this.name = ACTIONS.DRAW_LIFT;
      this.shape = new Lift();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "click"){
          this.shape.set_center(new Point(offset_x, offset_y));
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditLiftAction = function (shape) {
      this.name = ACTIONS.EDIT_LIFT;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.lift_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.lift_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".lift_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("lift_move_handle")){ return   "lift_move_handle"; }
          if(div.hasClass("lift_remove_handle")){ return "lift_remove_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "lift_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          offset_x = point.x_in_px - this.drag_start_point.x_in_px;
          offset_y = point.y_in_px - this.drag_start_point.y_in_px;

          new_center = new Point(this.shape_initial_center.x_in_px + offset_x, this.shape_initial_center.y_in_px + offset_y)
          this.shape.set_center(new_center);

          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          this.shape.draw();
        }
      }
    }


    var DrawElevatorAction = function () {
      this.name = ACTIONS.DRAW_ELEVATOR;
      this.shape = new Elevator();
      this.take_effect_now = function () {
        instance.canvas.css("cursor", "crosshair");
      }

      this.reset = function () {
        instance.canvas.css('cursor', 'default');
      }

      this.take_effect = function (pm_event) {
        offset_x = pm_event.mouse_event.pageX - instance.canvas.offset().left;
        offset_y = pm_event.mouse_event.pageY - instance.canvas.offset().top;

        if(pm_event.event_type == "click"){
          this.shape.set_center(new Point(offset_x, offset_y));
          this.shape.draw();
          instance.context.current_action.reset();
          instance.context.current_action = null;
        }
      }
    }

    var EditElevatorAction = function (shape) {
      this.name = ACTIONS.EDIT_LIFT;
      this.shape = shape;
      this.which_point_move = null;
      this.take_effect_now = function () {
        this.shape._rect.find('.elevator_move_handle').css('cursor','move');
        this.shape.editing();
      }

      this.reset = function () {
        this.shape._rect.find('.elevator_move_handle').css('cursor','default');
        this.shape.done_editing();
      }

      this.take_effect = function (pm_event) {
        function point_of_interest(event) {
          point = Point.from_event(event);
          handles = this.shape._rect.find(".elevator_handle");
          div = null
          for(var i=0; i<handles.length; i++){
            if(point.within_div($(handles[i]))){
              div = $(handles[i]);
              break;
            }
          }

          if(this.div == null){ return null; }

          if(div.hasClass("elevator_move_handle")){ return   "elevator_move_handle"; }
          if(div.hasClass("elevator_remove_handle")){ return "elevator_remove_handle"; }
        }

        drag_start_point = null;
        if(pm_event.event_type == "click"){
          point_of_interest = point_of_interest(pm_event.mouse_event);
          if(point_of_interest == "elevator_remove_handle"){
            this.shape.remove();
          }
        }

        if(pm_event.event_type == "drag_start"){
          this.which_point_move = point_of_interest(pm_event.mouse_event);
          this.drag_start_point = Point.from_event(pm_event.mouse_event);
          this.shape_initial_start_point = this.shape.start_point.clone();
          this.shape_initial_end_point   = this.shape.end_point.clone();
          this.shape_initial_center      = this.shape.center();
        }

        if(pm_event.event_type == "draging"){
          if(this.which_point_move == null){ return null; }

          point = Point.from_event(pm_event.mouse_event);
          offset_x = point.x_in_px - this.drag_start_point.x_in_px;
          offset_y = point.y_in_px - this.drag_start_point.y_in_px;

          new_center = new Point(this.shape_initial_center.x_in_px + offset_x, this.shape_initial_center.y_in_px + offset_y)
          this.shape.set_center(new_center);

          this.shape.drawing();
        }

        if(pm_event.event_type == "drag_stop"){
          if(this.which_point_move == null){ return null; }

          this.shape.draw();
        }
      }
    }


    var DummyAction = function () {
      this.name = ACTIONS.DUMMY;

      this.take_effect = function (pm_event) {
        if(pm_event.event_type == "click"){
        }
      }
    }

    Utils.proto_inheritance(Action, DummyAction);
    Utils.proto_inheritance(Action, ResetCanvasAction);
    Utils.proto_inheritance(Action, PanAction);
    Utils.proto_inheritance(Action, DrawLineAction);
    Utils.proto_inheritance(Action, EditLineAction);
    Utils.proto_inheritance(Action, DrawRectAction);
    Utils.proto_inheritance(Action, EditRectAction);
    Utils.proto_inheritance(Action, DrawParkSpaceAction);
    Utils.proto_inheritance(Action, EditParkSpaceAction);
    Utils.proto_inheritance(Action, DrawLaneAction);
    Utils.proto_inheritance(Action, EditLaneAction);
    Utils.proto_inheritance(Action, DrawPillarAction);
    Utils.proto_inheritance(Action, EditPillarAction);
    Utils.proto_inheritance(Action, DrawLiftAction);
    Utils.proto_inheritance(Action, EditLiftAction);
    Utils.proto_inheritance(Action, DrawElevatorAction);
    Utils.proto_inheritance(Action, EditElevatorAction);

    //////////////////////////////////////////////////////////////////////////////
    //
    //shapes definiation
    //
    //////////////////////////////////////////////////////////////////////////////

    var Shape = function () {
      this.name = null;
      this.cn_name = null;
      this.state = STATE.NOT_DRAW;
      this.uuid   = Utils.uuid();
      this.draw = null;
      this.start_point = null;
      this.end_point = null;
    }

    //shape property
    var ShapeProp = function () {
      this.css_key = null;
      this.ccs_value = null;
      this.name = null;
      this.cn_name = null;
      this.to_html = function () {
      };
      this.html_dom_type = function () {
      };
      this.html_dom_options = function () {
      }
    }

    var ThicknessProp = function () {
      this.css_key = "height";
      this.value   = "2px";
      this.css_value = "2px";
      this.name = "thickness";
      this.cn_name = "宽度";
      this.to_html = function () { return "<tr><td>" + this.cn_name + "</td><td><select>" + this.html_dom_options + "</select></td><tr>"; };
      this.html_dom_type = "select";
      this.html_dom_options = "2,3,4,5,6,7,8,9,10".split(",").map(function (v) { return "<option value='" +v+ "px'"+ (parseInt(v) == this.value ? 'selected' : '' ) +">" + v +"</option>"});
      this.setValue = function (val) {
        this.value = this.css_value = val;
      }

      this.to_json = function () {
        return {"height": this.css_value }
      }
    }

    var ColorProp = function () {
      this.css_key = "background-color";
      this.css_value = "#81e1ec";
      this.value = "#81e1ec";
      this.name = 'color';
      this.cn_name = "背景色";
      this.to_html = function () {  return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'colorpicker';
      this.setValue = function (val) {
        this.value = this.css_value = val;
      }
      this.to_json = function () {
        return {"background-color": this.css_value }
      }
    }

    var LeftBorderProp = function () {
      this.css_key = "border-left";
      this.css_value = "2px solid gray";
      this.value = "2px solid gray";
      this.name  = "border-left";
      this.cn_name = "左边框";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.value = this.css_value = val; }
      this.to_json = function () {
        return {"border-left": this.css_value }
      }
    }

    var RightBorderProp = function () {
      this.css_key = "border-right";
      this.css_value = "2px solid gray";
      this.value = "2px solid gray";
      this.name  = "border-right";
      this.cn_name = "右边框";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.value = this.css_value = val; }
      this.to_json = function () {
        return {"border-right": this.css_value }
      }
    }

    var TopBorderProp = function () {
      this.css_key = "border-top";
      this.css_value = "2px solid gray";
      this.value = "2px solid gray";
      this.name  = "border-top";
      this.cn_name = "上边框";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.value = this.css_value = val; }
      this.to_json = function () {
        return {"border-top": this.css_value }
      }
    }

    var BottomBorderProp = function () {
      this.css_key = "border-bottom";
      this.css_value = "2px solid gray";
      this.value = "2px solid gray";
      this.name  = "border-bottom";
      this.cn_name = "下边框";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.value = this.css_value = val; }

      this.to_json = function () {
        return {"border-bottom": this.css_value }
      }
    }

    var AngleProp = function () {
      this.shape = null;
      this.css_key = "transform";
      this.css_value = "rotate(0deg)";
      this.value = "rotate(0deg)";
      this.name  = "rotate";
      this.cn_name = "角度";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value+ "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.value = this.css_value = val; }
      this.to_json = function () {
        return {"transform": this.css_value }
      }
    }

    var TopProp = function () {
      this.shape = null;
      this.css_key = "top";
      this.css_value =  function () { return this.shape._rect.css('top'); };
      this.value = function () { return this.shape._rect.css('top'); };
      this.name  = "top";
      this.cn_name = "上";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value() + "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.shape._rect.css('top', val); }

      this.to_json = function () {
        return {"top": this.css_value() }
      }
    }

    var LeftProp = function () {
      this.shape = null;
      this.css_key = "left";
      this.css_value =  function () { return this.shape._rect.css('left'); };
      this.value = function () { return this.shape._rect.css('left'); };
      this.name  = "left";
      this.cn_name = "左";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value() + "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) {
        this.shape._rect.css('left', val);
      }
      this.to_json = function () {
        return {"left": this.css_value() }
      }
    }

    var HeightProp = function () {
      this.shape = null;
      this.css_key = "height";
      this.css_value = function () { return this.shape._rect.css('height'); }
      this.value =  function () { return this.shape._rect.css('height'); }
      this.name  = "height";
      this.cn_name = "高度";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value() + "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) {
        this.shape._rect.css('height', val);
      }
      this.to_json = function () {
        return {"height": this.css_value() }
      }
    }

    var WidthProp = function () {
      this.shape = null;
      this.css_key = "width";
      this.css_value = function () { return this.shape._rect.css('width'); }
      this.value = function () { return this.shape._rect.css('width'); }
      this.name  = "width";
      this.cn_name = "长度";
      this.to_html = function () {   return "<tr><td>" + this.cn_name + "</td><td><input value='" +this.css_value() + "' type='input'/></td></tr>";};
      this.html_dom_type = 'input';
      this.setValue = function (val) { this.shape._rect.css('width', val); }
      this.to_json = function () {
        return {"width": this.css_value() }
      }
    }


    var LaneImageProp = function () {
      this.shape = null;
      this.css_key = "background-image";
      this.css_value = function () { return this.shape._rect.data('direction'); }
      this.value = function () { return this.shape._rect.data('direction'); }
      this.name  = "background-image";
      this.cn_name = "图片";
      this.to_html = function () { return "<tr><td>" + this.cn_name + "</td><td><select>" + this.html_dom_options + "</select></td><tr>"; };
      this.html_dom_type = "select";
      this.html_dom_options = ["double", "left", "right", "right_top", "right_bottom", "left_top", "left_bottom"].map(function (v) { return "<option "+ (parseInt(v) == this.value ? 'selected' : '' ) +">" + v +"</option>"});
      this.setValue = function (val) {
        this.shape._rect.removeClass(["double", "left", "right", "right_top", "right_bottom", "left_top", "left_bottom"].map(function (d) {
          return "lane_" + d;
        }).join(" " )).addClass("lane_" + val);
      }
      this.to_json = function () {
        return {"width": this.css_value() }
      }
    }


    var Line = function () {
      this.name = "line";
      this.cn_name = "线";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='line'><div class='handle left_handle'></div><div class='handle remove_handle'>X</div><div class='handle right_handle'></div></div>");
      this._rect.css('border', 'none');
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "left top");

      this.point_within_range = function (point) {
        return this.distance_to_point(point) < 10;
      }

      this.setStartPoint = function (new_start_point) {
        this.start_point = new_start_point;
        this._update_cordinate();
      }

      this.setEndPoint = function (new_end_point) {
        this.end_point = new_end_point;
        this._update_cordinate();
      }

      this._update_cordinate = function () {
        this.prop_list.top.setValue(this.start_point.y_in_px + "px");
        this.prop_list.left.setValue(this.start_point.x_in_px + "px");
        if(this.end_point){
          this.prop_list.width.setValue(this.end_point.x_distance(this.start_point) + "px")
          angle = this.start_point.angle(this.end_point);
          this.prop_list.rotate.setValue("rotate(" + angle + "deg)");
        }
      }

      this.prop_list = {};
      line = this;
      [new ThicknessProp(), new ColorProp(), new TopProp(), new LeftProp(), new WidthProp(), new AngleProp()].map(function (prop) {
        prop.shape = line;
        line.prop_list[prop.name] = prop;
      });

      this.update = function () {
        this._draw();
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }
        instance.synchronizor.set_need_sync();
      }

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.handle').hide();
        instance.hide_prop_list_window();
      }

      this.drawing = function () {
        this.state = STATE.DRAWING;
        this._draw();
      }

      this.draw = function () {
        this._draw();
        this.state = STATE.DRAWN;
        this.done_drawing();
      }

      this.done_drawing = function () {
      }

      this.remove = function () {
        instance.objects.splice(instance.objects.indexOf(this));
        instance.synchronizor.set_need_sync();
        this._rect.remove();
      }

      this.distance_to_point = function(point) {
        x = point.x_in_px;
        y = point.y_in_px;

        x1 = this.start_point.x_in_px;
        y1 = this.start_point.y_in_px;

        x2 = this.end_point.x_in_px;
        y2 = this.end_point.y_in_px;

        var A = x - x1;
        var B = y - y1;
        var C = x2 - x1;
        var D = y2 - y1;

        var dot = A * C + B * D;
        var len_sq = C * C + D * D;
        var param = -1;
        if (len_sq != 0) //in case of 0 length line
          param = dot / len_sq;

        var xx, yy;

        if (param < 0) {
          xx = x1;
          yy = y1;
        }
        else if (param > 1) {
          xx = x2;
          yy = y2;
        }
        else {
          xx = x1 + param * C;
          yy = y1 + param * D;
        }

        var dx = x - xx;
        var dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
      }

      this.as_json = function () {
        defaults = {
          name: 'line',
          uuid: this.uuid,
          prop_list: {}
        };

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;

      }
    }


    var Rect = function () {
      this.name = "rect";
      this.cn_name = "矩形";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='rect'><div class='rect_handle rect_left_handle'></div><div class='rect_handle rect_remove_handle'>X</div><div class='rect_handle rect_right_handle'></div><div class='rect_handle rect_move_handle'></div><div class='rect_handle rect_rotate_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");

      this.width = function () {
        return this.end_point.x_in_px - this.start_point.x_in_px;
      }

      this.height = function () {
        return this.end_point.y_in_px - this.start_point.y_in_px;
      }

      this.center = function () {
        return new Point((this.end_point.x_in_px + this.start_point.x_in_px) / 2, (this.end_point.y_in_px + this.start_point.y_in_px) / 2);
      }

      this.setStartPoint = function (new_start_point) {
        this.start_point = new_start_point;
        this._update_cordinate();
      }

      this.setEndPoint = function (new_end_point) {
        this.end_point = new_end_point;
        this._update_cordinate();
      }

      this._update_cordinate = function () {
        this.prop_list.top.setValue(this.start_point.y_in_px + "px");
        this.prop_list.left.setValue(this.start_point.x_in_px + "px");
        if(this.end_point && this.prop_list.width && this.prop_list.height){
          this.prop_list.width.setValue(this.end_point.x_distance(this.start_point) + "px")
          this.prop_list.height.setValue(this.end_point.y_distance(this.start_point) + "px")
        }
      }

      this.point_within_range = function (point) {
        return point.x_in_px > this.start_point.x_in_px && point.x_in_px < this.end_point.x_in_px &&
          point.y_in_px > this.start_point.y_in_px && point.y_in_px < this.end_point.y_in_px;
      }

      this.prop_list = {};
      rect = this;
      [new ColorProp(), new LeftBorderProp(), new RightBorderProp(), new TopBorderProp(),
        new BottomBorderProp(), new AngleProp(), new TopProp(), new LeftProp(), new WidthProp(), new HeightProp()].map(function (prop) {
          prop.shape = rect;
          rect.prop_list[prop.name] = prop;
        });


        this.prop_list.color.setValue("#9bd23c");

        this.update = function () {
          this._draw();
        }

        this._draw = function () {
          for(prop_name in this.prop_list){
            if( typeof this.prop_list[prop_name].css_value === 'function'){
              this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
            }else{
              this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
            }
          }
          if(!this._rect.attr('append')){
            instance.canvas.append(this._rect);
            instance.objects.push(this);
            this._rect.attr('append', true);
          }
          instance.synchronizor.set_need_sync();
        }

        this.rotate = function (angle) {
          this.prop_list.rotate.setValue("rotate(" + angle + "deg)");
          this._draw();
        }

        this.editing = function () {
          this.state = STATE.EDITING;
          this._rect.find('.rect_handle').show();
          instance.show_prop_list_window(this);
        }

        this.done_editing = function () {
          this.state = STATE.DRAWN;
          this._rect.find('.rect_handle').hide();
          instance.hide_prop_list_window();
        }

        this.drawing = function () {
          this.state = STATE.DRAWING;
          this._draw();
        }

        this.draw = function () {
          this._draw();
          this.state = STATE.DRAWN;
          this.done_drawing();
        }

        this.done_drawing = function () {
        }

        this.remove = function () {
          instance.objects.splice(instance.objects.indexOf(this), 1);
          instance.synchronizor.set_need_sync();
          this._rect.remove();
        }

        this.as_json = function () {
          defaults = {
            name: "rect",
            uuid: this.uuid,
            prop_list: {}
          }

          for(prop in this.prop_list){
            defaults.prop_list[prop] = this.prop_list[prop].to_json();
          }

          return defaults;
        }
    }

    Utils.proto_inheritance(Shape, Line);
    Utils.proto_inheritance(Shape, Rect);

    var ParkSpace = function () {
      park_space = this;
      this.height_in_px = 50;
      this.width_in_px = 30;

      this.name = "park_space";
      this.cn_name = "车位";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='park_space'><div class='park_space_handle park_space_remove_handle'>X</div><div class='park_space_handle park_space_move_handle'></div><div class='park_space_handle park_space_rotate_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");
      this.prop_list = {};
      _.each([new AngleProp(), new TopProp(), new LeftProp()], function (prop) { park_space.prop_list[prop.name] = prop; prop.shape = park_space; });

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.park_space_handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.park_space_handle').hide();
        instance.hide_prop_list_window();
      }

      this.set_center = function (center) {
        this.center_point = center;
        this.prop_list.top.setValue(this.center_point.y_in_px - 15);
        this.prop_list.left.setValue(this.center_point.x_in_px - 15);
        this.start_point = new Point(this.center_point.x_in_px - 15, this.center_point.y_in_px - 25);
        this.end_point   = new Point(this.center_point.x_in_px + 15, this.center_point.y_in_px + 25);
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        this._rect.css('background-color', 'white');
        this._rect.css('height', '50px');
        this._rect.css('width', '30px');
        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }

        instance.synchronizor.set_need_sync();
      }

      this.as_json = function () {
        defaults = {
          name: "park_space",
          uuid: this.uuid,
          prop_list: {}
        }

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;
      }

    }
    Utils.proto_inheritance(Rect, ParkSpace);


    var Lane = function () {
      lane = this;
      this.height_in_px = 50;
      this.name = "lane";
      this.cn_name = "车道";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='lane'><div class='lane_handle lane_remove_handle'>X</div><div class='lane_handle lane_right_handle'></div><div class='lane_handle lane_move_handle'></div><div class='lane_handle lane_rotate_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");

      this.setStartPoint = function (new_start_point) {
        this.start_point = new_start_point;
        this._update_cordinate();
      }

      this.setEndPoint = function (new_end_point) {
        this.end_point = new_end_point;
        this._update_cordinate();
      }

      this._update_cordinate = function () {
        this.prop_list.top.setValue(this.start_point.y_in_px + "px");
        this.prop_list.left.setValue(this.start_point.x_in_px + "px");
        if(this.end_point){ this.prop_list.width.setValue(this.end_point.x_distance(this.start_point) + "px") }
      }


      this.width = function () {
        return this.end_point.x_in_px - this.start_point.x_in_px;
      }

      this.height = function () {
        return this.end_point.y_in_px - this.start_point.y_in_px;
      }

      this.center = function () {
        return new Point((this.end_point.x_in_px + this.start_point.x_in_px) / 2, (this.end_point.y_in_px + this.start_point.y_in_px) / 2);
      }

      this.point_within_range = function (point) {
        return point.x_in_px > this.start_point.x_in_px && point.x_in_px < this.end_point.x_in_px &&
          point.y_in_px > this.start_point.y_in_px && point.y_in_px < this.end_point.y_in_px;
      }

      this.prop_list = {};
      _.each([new AngleProp(), new WidthProp(), new TopProp(), new LeftProp(), new LaneImageProp()], function (prop) { lane.prop_list[prop.name] = prop; prop.shape = lane;});

      this.update = function () {
        this._draw();
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        this._rect.css('height', "50px");

        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }

        instance.synchronizor.set_need_sync();
      }

      this.rotate = function (angle) {
        this.prop_list.rotate.setValue("rotate(" + angle + "deg)")
      }

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.lane_handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.lane_handle').hide();
        instance.hide_prop_list_window();
      }

      this.drawing = function () {
        this.state = STATE.DRAWING;
        this._draw();
      }

      this.draw = function () {
        this._draw();
        this.state = STATE.DRAWN;
        this.done_drawing();
      }

      this.done_drawing = function () {
      }

      this.remove = function () {
        instance.objects.splice(instance.objects.indexOf(this), 1);
        instance.synchronizor.set_need_sync()
        this._rect.remove();
      }

      this.as_json = function () {
        defaults = {
          name: "lane",
          uuid: this.uuid,
          prop_list: {}
        }

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;
      }
    }

    Utils.proto_inheritance(Rect, Lane);

    var Pillar = function () {
      this.width_in_px = 20;
      this.height_in_px = 20;
      this.name = "pillar";
      this.cn_name = "柱子";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='pillar'><div class='pillar_handle pillar_remove_handle'>X</div><div class='pillar_handle pillar_move_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");

      this.width = function () {
        return this.end_point.x_in_px - this.start_point.x_in_px;
      }

      this.height = function () {
        return this.end_point.y_in_px - this.start_point.y_in_px;
      }

      this.center = function () {
        return new Point((this.end_point.x_in_px + this.start_point.x_in_px) / 2, (this.end_point.y_in_px + this.start_point.y_in_px) / 2);
      }

      this.set_center = function (center) {
        this.center_point = center;
        this.prop_list.top.setValue(this.center_point.y_in_px - 10);
        this.prop_list.left.setValue(this.center_point.x_in_px - 10);
        this.start_point = new Point(this.center_point.x_in_px - 10, this.center_point.y_in_px - 10);
        this.end_point   = new Point(this.center_point.x_in_px + 10, this.center_point.y_in_px + 10);
      }

      this.point_within_range = function (point) {
        return point.x_in_px > this.start_point.x_in_px && point.x_in_px < this.end_point.x_in_px &&
          point.y_in_px > this.start_point.y_in_px && point.y_in_px < this.end_point.y_in_px;
      }

      this.prop_list = {};
      rect = this;
      [new ColorProp(), new TopProp(), new LeftProp()].map(function (prop) {
        prop.shape = rect;
        rect.prop_list[prop.name] = prop;
      });


      this.prop_list.color.setValue("#9bd23c");

      this.update = function () {
        this._draw();
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        this._rect.css('height', '20px');
        this._rect.css('width', '20px');
        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }
        instance.synchronizor.set_need_sync();
      }

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.pillar_handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.pillar_handle').hide();
        instance.hide_prop_list_window();
      }

      this.drawing = function () {
        this.state = STATE.DRAWING;
        this._draw();
      }

      this.draw = function () {
        this._draw();
        this.state = STATE.DRAWN;
        this.done_drawing();
      }

      this.done_drawing = function () {
      }

      this.remove = function () {
        instance.objects.splice(instance.objects.indexOf(this), 1);
        instance.synchronizor.set_need_sync()
        this._rect.remove();
      }

      this.as_json = function () {
        defaults = {
          name: "pillar",
          uuid: this.uuid,
          prop_list: {}
        }

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;
      }
    }

    Utils.proto_inheritance(Rect, Pillar);


    var Lift = function () {
      this.height_in_px = this.width_in_px = 25;
      this.name = "lift";
      this.cn_name = "电梯";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='lift'><div class='lift_handle lift_remove_handle'>X</div><div class='lift_handle lift_move_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");

      this.width = function () {
        return this.end_point.x_in_px - this.start_point.x_in_px;
      }

      this.height = function () {
        return this.end_point.y_in_px - this.start_point.y_in_px;
      }


      this.set_center = function (center) {
        this.center_point = center;
        this.prop_list.top.setValue(this.center_point.y_in_px - 25);
        this.prop_list.left.setValue(this.center_point.x_in_px - 25);
        this.start_point = new Point(this.center_point.x_in_px - 25, this.center_point.y_in_px - 25);
        this.end_point   = new Point(this.center_point.x_in_px + 25, this.center_point.y_in_px + 25);
      }
      this.center = function () {
        return new Point((this.end_point.x_in_px + this.start_point.x_in_px) / 2, (this.end_point.y_in_px + this.start_point.y_in_px) / 2);
      }

      this.point_within_range = function (point) {
        return point.x_in_px > this.start_point.x_in_px && point.x_in_px < this.end_point.x_in_px &&
          point.y_in_px > this.start_point.y_in_px && point.y_in_px < this.end_point.y_in_px;
      }

      this.prop_list = {};
      rect = this;
      [new TopProp(), new LeftProp()].map(function (prop) {
        prop.shape = rect;
        rect.prop_list[prop.name] = prop;
      });

      this.update = function () {
        this._draw();
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        this._rect.css('height', '50px');
        this._rect.css('width', '50px');
        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }

        instance.synchronizor.set_need_sync();
      }

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.lift_handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.lift_handle').hide();
        instance.hide_prop_list_window();
      }

      this.drawing = function () {
        this.state = STATE.DRAWING;
        this._draw();
      }

      this.draw = function () {
        this._draw();
        this.state = STATE.DRAWN;
        this.done_drawing();
      }

      this.done_drawing = function () {
      }

      this.remove = function () {
        instance.objects.splice(instance.objects.indexOf(this), 1);
        instance.synchronizor.set_need_sync();
        this._rect.remove();
      }

      this.as_json = function () {
        defaults = {
          name: "lift",
          uuid: this.uuid,
          prop_list: {}
        }

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;
      }
    }

    Utils.proto_inheritance(Rect, Lift);


    var Elevator = function () {
      this.height_in_px = this.width_in_px = 25;
      this.name = "elevator";
      this.cn_name = "扶梯";
      this.uuid   = Utils.uuid();
      this._rect = $("<div class='elevator'><div class='elevator_handle elevator_remove_handle'>X</div><div class='elevator_handle elevator_move_handle'></div></div>");
      this._rect.css('position', 'absolute');
      this._rect.css('transform-origin', "center");

      this.width = function () {
        return this.end_point.x_in_px - this.start_point.x_in_px;
      }

      this.height = function () {
        return this.end_point.y_in_px - this.start_point.y_in_px;
      }

      this.center = function () {
        return new Point((this.end_point.x_in_px + this.start_point.x_in_px) / 2, (this.end_point.y_in_px + this.start_point.y_in_px) / 2);
      }

      this.set_center = function (center) {
        this.center_point = center;
        this.prop_list.top.setValue(this.center_point.y_in_px - 25);
        this.prop_list.left.setValue(this.center_point.x_in_px - 25);
        this.start_point = new Point(this.center_point.x_in_px - 25, this.center_point.y_in_px - 25);
        this.end_point   = new Point(this.center_point.x_in_px + 25, this.center_point.y_in_px + 25);
      }

      this.point_within_range = function (point) {
        return point.x_in_px > this.start_point.x_in_px && point.x_in_px < this.end_point.x_in_px &&
          point.y_in_px > this.start_point.y_in_px && point.y_in_px < this.end_point.y_in_px;
      }

      this.prop_list = {};
      rect = this;
      [new TopProp(), new LeftProp()].map(function (prop) {
        prop.shape = rect;
        rect.prop_list[prop.name] = prop;
      });



      this.update = function () {
        this._draw();
      }

      this._draw = function () {
        for(prop_name in this.prop_list){
          if( typeof this.prop_list[prop_name].css_value === 'function'){
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value());
          }else{
            this._rect.css(this.prop_list[prop_name].css_key, this.prop_list[prop_name].css_value);
          }
        }
        this._rect.css('height', '50px');
        this._rect.css('width', '50px');
        if(!this._rect.attr('append')){
          instance.canvas.append(this._rect);
          instance.objects.push(this);
          this._rect.attr('append', true);
        }

        instance.synchronizor.set_need_sync();
      }

      this.editing = function () {
        this.state = STATE.EDITING;
        this._rect.find('.elevator_handle').show();
        instance.show_prop_list_window(this);
      }

      this.done_editing = function () {
        this.state = STATE.DRAWN;
        this._rect.find('.elevator_handle').hide();
        instance.hide_prop_list_window();
      }

      this.drawing = function () {
        this.state = STATE.DRAWING;
        this._draw();
      }

      this.draw = function () {
        this._draw();
        this.state = STATE.DRAWN;
        this.done_drawing();
      }

      this.done_drawing = function () {
      }

      this.remove = function () {
        instance.objects.splice(instance.objects.indexOf(this), 1);
        instance.synchronizor.set_need_sync();
        this._rect.remove();
      }

      this.as_json = function () {
        defaults = {
          name: "elevator",
          uuid: this.uuid,
          prop_list: {}
        }

        for(prop in this.prop_list){
          defaults.prop_list[prop] = this.prop_list[prop].to_json();
        }

        return defaults;
      }
    }

    Utils.proto_inheritance(Rect, Elevator);


    //point
    var Point = function(x, y){
      this.x_in_px = x;
      this.y_in_px = y;
      this.x_in_m  = 0;
      this.y_in_m  = 0;
      this.x_slot = parseInt(x / 10) * 10;
      this.y_slot = parseInt(y / 10) * 10;
      this.distance = function (other_point) {
        return parseInt(Math.sqrt( Math.pow(other_point.x_in_px - this.x_in_px, 2) + Math.pow(other_point.y_in_px - this.y_in_px, 2)));
      }

      this.x_distance = function (other_point) {
        x_distance = parseInt(other_point.x_in_px - this.x_in_px);
        return Math.abs(x_distance);
      }

      this.y_distance = function (other_point) {
        y_distance =  parseInt(other_point.y_in_px - this.y_in_px);
        return Math.abs(y_distance);
      }

      this.angle = function (other_point) {
        diff_x = other_point.x_in_px - this.x_in_px;
        diff_y = other_point.y_in_px - this.y_in_px;

        return Math.atan2(diff_y, diff_x) * (180 / Math.PI);
      }

      this.within_div = function (dom) {
        dom_left_top_x = dom.offset().left - instance.canvas.offset().left;
        dom_left_top_y = dom.offset().top  - instance.canvas.offset().top;

        return this.x_in_px > dom_left_top_x && this.x_in_px < dom_left_top_x + dom.width() &&
          this.y_in_px > dom_left_top_y && this.y_in_px < dom_left_top_y + dom.height();
      }

      this.clone = function () {
        return new Point(this.x_in_px, this.y_in_px);
      }

    }

    Point.from_event = function (event) {
      x = event.pageX - instance.canvas.offset().left;
      y = event.pageY - instance.canvas.offset().top;

      return new Point(x, y);
    }

    var PmEvent = function (event_type, mouse_event) {
      this.event_type = event_type;
      this.mouse_event = mouse_event;
    }
  };


  $.fn.park_map = function( options ) {
    var settings = $.extend({
      width_in_meter: 200,
      height_in_meter: 200,
      draw_indicator: true,
      container: '#container'
    }, options );

    if(typeof settings.container === 'string')
      settings.container = $(settings.container);

    var park_map = new ParkMap(settings)
    park_map.initialize();
  };

}( jQuery ))







$(document).ready( function () {
  $("#container").park_map({});
});


