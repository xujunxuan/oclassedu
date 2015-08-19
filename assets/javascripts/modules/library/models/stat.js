define([
    'app'
],function(
    app
    ){
    'use strict';
    var Model = Backbone.Model.extend({
        defaults: {
            library_id: '',
            hit_count: '',
            week_hit_count: '',
            month_hit_count: '',
            lib_name: '',
            cate_stat: []
        }
        , idAttribute: "library_id"
        , initialize: function(attrs, options){
        }
    });
    return Model;
});