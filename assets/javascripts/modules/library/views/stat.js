define([
    'app'
    , 'text!modules/library/templates/stat.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: "访问统计"
        , events: {}
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({
                stats: this.collection.toJSON()
            }));
            return this;
        }
    });
    return View;
});