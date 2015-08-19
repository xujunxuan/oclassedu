define([
    'app'
],function(
    app
    ){
    'use strict';
    var Model = Backbone.Model.extend({
        defaults: {}
        , initialize: function(attrs, options){
        }
        , urlRoot: app.api + '/search/'
        , parse: function(response){
            this.page = response.page;
            this.pagesize = response.pagesize;
            this.pages = Math.ceil(response.total / response.pagesize);
            if(response.pkg){
                return response.pkg;
            }else{
                return response;
            }
        }
    });
    return Model;
});