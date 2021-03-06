define([
    'app'
    , 'text!modules/library/templates/resource.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        template: _.template(template)
        , title: function(){
            return this.model.get('resource').title;
        }
        , events: {
          'click .more-btn a': 'toggleMore'
        }
        , initialize: function(options){
            this.options = options || {};
        }
        , render: function(){
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
        , toggleMore: function(e){
            var $this = $(e.currentTarget),
                $more = $this.closest('.more-btn').siblings('.resource-more');
            if($more.css('display') == 'none'){
                $more.show();
                $this.html('隐藏更多 <i class="icon icon-arrow-circle-up"></i>');
            }else{
                $more.hide();
                $this.html('查看更多 <i class="icon icon-arrow-circle-down"></i>');
            }
        }
    });
    return View;
});