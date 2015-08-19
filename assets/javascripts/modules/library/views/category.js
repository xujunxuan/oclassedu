define([
    'app'
    , 'text!modules/library/templates/category.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('category').prarent.name;
        }
        , cateid: function(){
            return this.model.get('category').prarent.id;
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template({
                category: this.model.toJSON()
                , page: this.model.page
                , pages: this.model.pages
                , pagesize: this.model.pagesize
                , cid: this.options.cid
                , current_page: this.options.page
            }));
            return this;
        }
    });
    return View;
});