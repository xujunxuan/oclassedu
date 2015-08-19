define([
    'app'
    , 'text!modules/library/templates/library.html'
],function(
    app
    , template
    ){
    'use strict';
    var View = Backbone.View.extend({
        title: '首页'
        , template: _.template(template)
        , events: {
            'click .more-btn a': 'toggleMore'
        }
        , initialize: function(){
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