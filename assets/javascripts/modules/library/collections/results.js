define([
    'app'
    , 'modules/library/models/resource'
],function(
    app
    , Resource
    ){
    'use strict';
    var Collection = Backbone.Collection.extend({
        model: Resource
        , initialize: function(attrs, options){
        }
        , url: app.api + '/search/'
        , parse: function(response){
            this.page = response.page;
            this.pagesize = response.pagesize;
            this.pages = Math.ceil(response.total / response.pagesize);
            response.category && (this.categorys = response.category);
            response.college && (this.colleges = response.college);
            return response.pkg.list;
        }
    });
    return Collection;
});